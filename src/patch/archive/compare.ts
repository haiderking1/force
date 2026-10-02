import { bytesToHex } from "../../shared/encoding/hex.ts";
import { readMsbBits } from "../../archive/buddha/bits.ts";
import {
  BUDDHA_CONTENT_BITS,
  BUDDHA_ENTRY_SIZE,
  BUDDHA_EXTENSION_BITS,
  BUDDHA_PAYLOAD_OFFSET_BITS,
  BUDDHA_STORED_SIZE_BITS,
} from "../../archive/buddha/limits.ts";
import { parseBuddhaHeader } from "../../archive/buddha/header.ts";
import type { ArchiveEntry, ArchiveList } from "../../archive/types.ts";
import { PatchError } from "../errors.ts";
import { sha256Bytes } from "../hash.ts";
import { patchEntrySizeFields } from "./entry-fields.ts";
import { headerBytesExceptRecords } from "./replace-entries.ts";

export type UntouchedEntryCheck = {
  readonly identifier: string;
  readonly index: number;
  readonly payloadOffset: number;
  readonly storedSha256: string;
  readonly recordBytes: string;
  readonly extensionBits: number;
};

export function collectUntouchedEntries(
  list: ArchiveList,
  header: Uint8Array,
  payload: Uint8Array,
  replacedIndexes: ReadonlySet<number>,
): readonly UntouchedEntryCheck[] {
  const checks: UntouchedEntryCheck[] = [];
  for (const entry of list.entries) {
    if (replacedIndexes.has(entry.index)) {
      continue;
    }
    if (entry.payloadOffset + entry.storedSize > payload.length) {
      throw new PatchError("RANGE", `${entry.identifier}: stored range exceeds payload during compare`);
    }
    const record = header.subarray(entry.recordOffset, entry.recordOffset + BUDDHA_ENTRY_SIZE);
    checks.push({
      identifier: entry.identifier,
      index: entry.index,
      payloadOffset: entry.payloadOffset,
      storedSha256: sha256Bytes(payload.subarray(entry.payloadOffset, entry.payloadOffset + entry.storedSize)),
      recordBytes: bytesToHex(record),
      extensionBits: readMsbBits(record, 5, 5, BUDDHA_EXTENSION_BITS),
    });
  }
  return checks;
}

export function assertUntouchedEntriesMatch(
  original: readonly UntouchedEntryCheck[],
  rebuilt: readonly UntouchedEntryCheck[],
): void {
  if (original.length !== rebuilt.length) {
    throw new PatchError(
      "ROUNDTRIP",
      `Untouched entry count changed from ${original.length} to ${rebuilt.length}`,
    );
  }
  for (let index = 0; index < original.length; index += 1) {
    const left = original[index];
    const right = rebuilt[index];
    if (left === undefined || right === undefined) {
      continue;
    }
    if (
      left.identifier !== right.identifier ||
      left.index !== right.index ||
      left.payloadOffset !== right.payloadOffset ||
      left.storedSha256 !== right.storedSha256 ||
      left.recordBytes !== right.recordBytes ||
      left.extensionBits !== right.extensionBits
    ) {
      throw new PatchError(
        "ROUNDTRIP",
        `Untouched entry ${left.identifier} changed after replacement`,
      );
    }
  }
}

export function replacedEntryPreservedBits(
  originalRecord: Uint8Array,
  nextRecord: Uint8Array,
): { readonly extensionBits: number } {
  const originalExtension = readMsbBits(originalRecord, 5, 5, BUDDHA_EXTENSION_BITS);
  const nextExtension = readMsbBits(nextRecord, 5, 5, BUDDHA_EXTENSION_BITS);
  if (originalExtension !== nextExtension) {
    throw new PatchError("ROUNDTRIP", "Replacement changed the extra content size or reserved index bit");
  }
  const restored = patchEntrySizeFields(nextRecord, {
    contentSize: readMsbBits(originalRecord, 0, 0, BUDDHA_CONTENT_BITS),
    payloadOffset: readMsbBits(originalRecord, 8, 0, BUDDHA_PAYLOAD_OFFSET_BITS),
    storedSize: readMsbBits(originalRecord, 11, 5, BUDDHA_STORED_SIZE_BITS),
  });
  if (bytesToHex(restored) !== bytesToHex(originalRecord)) {
    throw new PatchError("ROUNDTRIP", "Replacement changed name, type, compress, or other preserved index bits");
  }
  return { extensionBits: nextExtension };
}

export function headerOutsideReplacementFieldsEqual(
  originalHeader: Uint8Array,
  nextHeader: Uint8Array,
  replaced: readonly ArchiveEntry[],
): void {
  parseBuddhaHeader(originalHeader);
  parseBuddhaHeader(nextHeader);
  const offsets = replaced.map((entry) => entry.recordOffset);
  const left = headerBytesExceptRecords(originalHeader, offsets);
  const right = headerBytesExceptRecords(nextHeader, offsets);
  if (sha256Bytes(left) !== sha256Bytes(right)) {
    throw new PatchError("ROUNDTRIP", "Replacement changed header bytes outside the replaced records and data footer");
  }
}
