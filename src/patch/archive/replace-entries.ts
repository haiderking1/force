import { bytesToHex } from "../../shared/encoding/hex.ts";
import { writeU64Be } from "../../archive/buddha/bits.ts";
import { decompressBuddhaPayload } from "../../archive/buddha/compression.ts";
import { BUDDHA_ENTRY_SIZE, BUDDHA_MAX_HEADER_BYTES } from "../../archive/buddha/limits.ts";
import { parseBuddhaHeader } from "../../archive/buddha/header.ts";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { payloadPathFromHeader } from "../../archive/companion-path.ts";
import { readFileInto, readFileRange, readWholeFile } from "../../archive/read-range.ts";
import type { ArchiveEntry } from "../../archive/types.ts";
import { PatchError } from "../errors.ts";
import { sha256Bytes } from "../hash.ts";
import { entrySlotEnd, patchEntrySizeFields } from "./entry-fields.ts";
import { alignUp, detectPayloadAlignment, storeReplacementPayload } from "./store.ts";

export type EntryReplacement = {
  readonly identifier: string;
  readonly bytes: Uint8Array;
};

export type ReplacedEntryInfo = {
  readonly identifier: string;
  readonly index: number;
  readonly placement: "in-place" | "append";
  readonly original: {
    readonly payloadOffset: number;
    readonly storedSize: number;
    readonly contentSize: number;
    readonly recordBytes: string;
    readonly storedSha256: string;
    readonly contentSha256: string;
  };
  readonly next: {
    readonly payloadOffset: number;
    readonly storedSize: number;
    readonly contentSize: number;
    readonly recordBytes: string;
    readonly storedSha256: string;
    readonly contentSha256: string;
  };
};

export type PackReplaceResult = {
  readonly header: Uint8Array;
  readonly payload: Uint8Array;
  readonly replacements: readonly ReplacedEntryInfo[];
  readonly alignment: number;
  readonly originalHeaderSha256: string;
  readonly originalPayloadSha256: string;
};

async function readStored(payloadPath: string, payloadLength: number, entry: ArchiveEntry): Promise<Uint8Array> {
  if (entry.payloadOffset + entry.storedSize > payloadLength) {
    throw new PatchError("RANGE", `${entry.identifier}: stored range exceeds payload`);
  }
  return (await readFileRange(payloadPath, entry.payloadOffset, entry.storedSize)).bytes;
}

type PayloadWrite = {
  readonly identifier: string;
  readonly offset: number;
  readonly bytes: Uint8Array;
  readonly originalOffset: number;
  readonly originalSize: number;
  readonly originalSha256: string;
};

// Packs can be hundreds of megabytes. Plan every replacement from small range
// reads first, then hold exactly one payload-sized buffer for the result.
export async function replaceBuddhaEntries(options: {
  readonly headerPath: string;
  readonly payloadPath?: string;
  readonly replacements: readonly EntryReplacement[];
}): Promise<PackReplaceResult> {
  if (options.replacements.length === 0) {
    throw new PatchError("VALIDATION", "replaceBuddhaEntries requires at least one replacement");
  }
  const payloadPath = options.payloadPath ?? payloadPathFromHeader(options.headerPath);
  const headerRead = await readWholeFile(options.headerPath, BUDDHA_MAX_HEADER_BYTES);
  const parsedHeader = parseBuddhaHeader(headerRead.bytes);
  const list = await openBuddhaPack({ headerPath: options.headerPath, payloadPath });
  if (list.payloadSize === undefined) {
    throw new PatchError("RANGE", `Payload size of ${payloadPath} is unknown`);
  }
  const originalPayloadLength = list.payloadSize;
  const alignment = detectPayloadAlignment(list.entries.map((entry) => entry.payloadOffset));

  const header = headerRead.bytes.slice();
  const writes: PayloadWrite[] = [];
  let payloadSize = originalPayloadLength;
  const infos: ReplacedEntryInfo[] = [];
  const seen = new Set<string>();

  for (const replacement of options.replacements) {
    if (seen.has(replacement.identifier)) {
      throw new PatchError("VALIDATION", `Duplicate replacement for ${replacement.identifier}`);
    }
    seen.add(replacement.identifier);
    const matches = list.entries.filter(
      (entry) => entry.identifier === replacement.identifier || entry.name === replacement.identifier,
    );
    if (matches.length !== 1) {
      throw new PatchError(
        "ENTRY",
        matches.length === 0
          ? `No archive entry named ${replacement.identifier}`
          : `Archive entry name ${replacement.identifier} is not unique`,
      );
    }
    const entry = matches[0];
    if (entry === undefined) {
      throw new PatchError("ENTRY", `No archive entry named ${replacement.identifier}`);
    }
    if (entry.rangeError !== undefined) {
      throw new PatchError("RANGE", `${entry.identifier}: ${entry.rangeError}`);
    }
    if (entry.extraContentSize !== 0) {
      // The writer only sets the 24-bit content size. How the game splits a decoded
      // entry between content and extra content is unknown, so do not guess.
      throw new PatchError(
        "ENTRY",
        `${entry.identifier}: content size is split ${entry.primaryContentSize}+${entry.extraContentSize}; replacing split-size entries is not supported`,
      );
    }
    const compression = entry.compression;
    const stored = storeReplacementPayload(replacement.bytes, compression);
    const originalStored = await readStored(payloadPath, originalPayloadLength, entry);
    const originalContent = decompressBuddhaPayload(originalStored, compression, entry.contentSize);
    const originalRecord = header.slice(entry.recordOffset, entry.recordOffset + BUDDHA_ENTRY_SIZE);
    const slotEnd = entrySlotEnd(list.entries, entry.index, parsedHeader.dataFooterOffset);
    // Footer offsets can include alignment padding absent from the physical file,
    // especially after an earlier append. Only existing bytes are writable in place.
    const available = Math.min(slotEnd, originalPayloadLength) - entry.payloadOffset;
    const placement = stored.length <= available ? "in-place" : "append";
    const payloadOffset = placement === "in-place" ? entry.payloadOffset : alignUp(payloadSize, alignment);
    if (placement === "append") {
      // Alignment gaps stay zero because the result buffer is freshly allocated.
      payloadSize = payloadOffset + stored.length;
    }
    const originalStoredSha256 = sha256Bytes(originalStored);
    writes.push({
      identifier: entry.identifier,
      offset: payloadOffset,
      bytes: stored,
      originalOffset: entry.payloadOffset,
      originalSize: entry.storedSize,
      originalSha256: originalStoredSha256,
    });
    const nextRecord = patchEntrySizeFields(originalRecord, {
      contentSize: replacement.bytes.length,
      payloadOffset,
      storedSize: stored.length,
    });
    header.set(nextRecord, entry.recordOffset);
    infos.push({
      identifier: entry.identifier,
      index: entry.index,
      placement,
      original: {
        payloadOffset: entry.payloadOffset,
        storedSize: entry.storedSize,
        contentSize: entry.contentSize,
        recordBytes: bytesToHex(originalRecord),
        storedSha256: originalStoredSha256,
        contentSha256: sha256Bytes(originalContent),
      },
      next: {
        payloadOffset,
        storedSize: stored.length,
        contentSize: replacement.bytes.length,
        recordBytes: bytesToHex(nextRecord),
        storedSha256: sha256Bytes(stored),
        contentSha256: sha256Bytes(replacement.bytes),
      },
    });
  }

  const lastCovered = infos.reduce((max, info) => Math.max(max, info.next.payloadOffset + info.next.storedSize), 0);
  const dataFooter = Math.max(parsedHeader.dataFooterOffset, alignUp(lastCovered, alignment));
  writeU64Be(header, 48, dataFooter);

  const payload = new Uint8Array(payloadSize);
  const readLength = await readFileInto(payloadPath, payload);
  if (readLength !== originalPayloadLength) {
    throw new PatchError("RANGE", `Payload ${payloadPath} changed size from ${originalPayloadLength} to ${readLength} during rebuild`);
  }
  // Planning and this read are separate snapshots. The recorded originals must
  // describe the bytes this payload is actually rebuilt from.
  for (const write of writes) {
    const current = payload.subarray(write.originalOffset, write.originalOffset + write.originalSize);
    if (sha256Bytes(current) !== write.originalSha256) {
      throw new PatchError("RANGE", `${write.identifier}: payload changed between planning and rebuild`);
    }
  }
  const originalPayloadSha256 = sha256Bytes(payload.subarray(0, originalPayloadLength));
  for (const write of writes) {
    payload.set(write.bytes, write.offset);
  }

  return {
    header,
    payload,
    replacements: infos,
    alignment,
    originalHeaderSha256: sha256Bytes(headerRead.bytes),
    originalPayloadSha256,
  };
}

export function headerBytesExceptRecords(header: Uint8Array, recordOffsets: readonly number[]): Uint8Array {
  const copy = header.slice();
  for (const offset of recordOffsets) {
    copy.fill(0, offset, offset + BUDDHA_ENTRY_SIZE);
  }
  writeU64Be(copy, 48, 0);
  return copy;
}
