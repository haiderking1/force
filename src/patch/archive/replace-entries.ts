import { writeU64Be } from "../../archive/buddha/bits.ts";
import { decompressBuddhaPayload } from "../../archive/buddha/compression.ts";
import { BUDDHA_ENTRY_SIZE, BUDDHA_MAX_HEADER_BYTES } from "../../archive/buddha/limits.ts";
import { parseBuddhaHeader } from "../../archive/buddha/header.ts";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { payloadPathFromHeader } from "../../archive/companion-path.ts";
import { readWholeFile } from "../../archive/read-range.ts";
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

function recordBytesHex(record: Uint8Array): string {
  return [...record].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function readStored(payload: Uint8Array, entry: ArchiveEntry): Uint8Array {
  if (entry.payloadOffset + entry.storedSize > payload.length) {
    throw new PatchError("RANGE", `${entry.identifier}: stored range exceeds payload`);
  }
  return payload.subarray(entry.payloadOffset, entry.payloadOffset + entry.storedSize);
}

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
  const payloadRead = await readWholeFile(payloadPath, Number.MAX_SAFE_INTEGER);
  const parsedHeader = parseBuddhaHeader(headerRead.bytes);
  const list = await openBuddhaPack({ headerPath: options.headerPath, payloadPath });
  const alignment = detectPayloadAlignment(list.entries.map((entry) => entry.payloadOffset));

  const header = headerRead.bytes.slice();
  const payloadCopy = payloadRead.bytes.slice();
  const payloadChunks: Uint8Array[] = [payloadCopy];
  let payloadSize = payloadCopy.length;
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
    const compression = entry.compression;
    const stored = storeReplacementPayload(replacement.bytes, compression);
    const originalStored = readStored(payloadRead.bytes, entry);
    const originalContent = decompressBuddhaPayload(originalStored, compression, entry.contentSize);
    const originalRecord = header.slice(entry.recordOffset, entry.recordOffset + BUDDHA_ENTRY_SIZE);
    const slotEnd = entrySlotEnd(list.entries, entry.index, parsedHeader.dataFooterOffset);
    // Footer offsets can include alignment padding absent from the physical file,
    // especially after an earlier append. Only existing bytes are writable in place.
    const available = Math.min(slotEnd, payloadCopy.length) - entry.payloadOffset;
    const placement = stored.length <= available ? "in-place" : "append";
    const payloadOffset = placement === "in-place" ? entry.payloadOffset : alignUp(payloadSize, alignment);
    if (placement === "append") {
      if (payloadOffset > payloadSize) {
        payloadChunks.push(new Uint8Array(payloadOffset - payloadSize));
        payloadSize = payloadOffset;
      }
      payloadChunks.push(stored);
      payloadSize += stored.length;
    } else {
      const region = payloadChunks[0];
      if (region === undefined) {
        throw new PatchError("RANGE", "Payload copy is missing");
      }
      region.set(stored, payloadOffset);
    }
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
        recordBytes: recordBytesHex(originalRecord),
        storedSha256: sha256Bytes(originalStored),
        contentSha256: sha256Bytes(originalContent),
      },
      next: {
        payloadOffset,
        storedSize: stored.length,
        contentSize: replacement.bytes.length,
        recordBytes: recordBytesHex(nextRecord),
        storedSha256: sha256Bytes(stored),
        contentSha256: sha256Bytes(replacement.bytes),
      },
    });
  }

  const lastCovered = infos.reduce((max, info) => Math.max(max, info.next.payloadOffset + info.next.storedSize), 0);
  const dataFooter = Math.max(parsedHeader.dataFooterOffset, alignUp(lastCovered, alignment));
  writeU64Be(header, 48, dataFooter);

  const payload = new Uint8Array(payloadSize);
  let writeAt = 0;
  for (const chunk of payloadChunks) {
    payload.set(chunk, writeAt);
    writeAt += chunk.length;
  }

  return {
    header,
    payload,
    replacements: infos,
    alignment,
    originalHeaderSha256: sha256Bytes(headerRead.bytes),
    originalPayloadSha256: sha256Bytes(payloadRead.bytes),
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
