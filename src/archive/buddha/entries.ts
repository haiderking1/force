import type { ArchiveCompression, ArchiveEntry, ArchiveFileType, ArchiveOverlap } from "../types.ts";
import { ArchiveError } from "../errors.ts";
import { readCString, readMsbBits } from "./bits.ts";
import type { BuddhaHeader } from "./header.ts";
import {
  BUDDHA_COMPRESS_NONE,
  BUDDHA_COMPRESS_ZLIB,
  BUDDHA_CONTENT_BITS,
  BUDDHA_ENTRY_SIZE,
  BUDDHA_EXTRA_CONTENT_BITS,
  BUDDHA_MAX_ENTRY_NAME,
  BUDDHA_NAME_OFFSET_BITS,
  BUDDHA_PAYLOAD_OFFSET_BITS,
  BUDDHA_STORED_SIZE_BITS,
} from "./limits.ts";

function compressionFromFlag(flag: number): ArchiveCompression {
  if (flag === BUDDHA_COMPRESS_NONE) {
    return "none";
  }
  if (flag === BUDDHA_COMPRESS_ZLIB) {
    return "zlib";
  }
  return "unsupported";
}

function rangeError(
  payloadOffset: number,
  storedSize: number,
  payloadSize: number | undefined,
): string | undefined {
  if (payloadOffset + storedSize > Number.MAX_SAFE_INTEGER) {
    return "offset+size overflow";
  }
  if (payloadSize !== undefined && payloadOffset + storedSize > payloadSize) {
    return `payload range ${payloadOffset}+${storedSize} exceeds payload size ${payloadSize}`;
  }
  return undefined;
}

export function parseBuddhaEntries(
  bytes: Uint8Array,
  header: BuddhaHeader,
  types: readonly ArchiveFileType[],
  payloadSize: number | undefined,
): { readonly entries: readonly ArchiveEntry[]; readonly overlaps: readonly ArchiveOverlap[] } {
  const entries: ArchiveEntry[] = [];
  for (let index = 0; index < header.fileCount; index += 1) {
    const recordOffset = header.fileIndexOffset + index * BUDDHA_ENTRY_SIZE;
    const record = bytes.subarray(recordOffset, recordOffset + BUDDHA_ENTRY_SIZE);
    if (record.length !== BUDDHA_ENTRY_SIZE) {
      throw new ArchiveError("BOUNDS", `File index record ${index} is truncated`);
    }
    const primaryContentSize = readMsbBits(record, 0, 0, BUDDHA_CONTENT_BITS);
    const nameTableOffset = readMsbBits(record, 3, 0, BUDDHA_NAME_OFFSET_BITS);
    const extraContentSize = readMsbBits(record, 5, 5, BUDDHA_EXTRA_CONTENT_BITS);
    const payloadOffset = readMsbBits(record, 8, 0, BUDDHA_PAYLOAD_OFFSET_BITS);
    const storedSize = readMsbBits(record, 11, 5, BUDDHA_STORED_SIZE_BITS);
    const typeRaw = readMsbBits(record, 14, 4, 8);
    const lastByte = record[15];
    if (lastByte === undefined) {
      throw new ArchiveError("BOUNDS", `File index record ${index} is truncated`);
    }
    const compressFlag = lastByte & 0x0f;
    const typeIndex = typeRaw >> 1;
    const typeName = types[typeIndex]?.name;
    const nameAbsolute = header.fileNameOffset + nameTableOffset;
    const nameWithinTable = nameTableOffset < header.fileNameLength && nameAbsolute < bytes.length;
    const name = nameWithinTable
      ? readCString(bytes, nameAbsolute, Math.min(BUDDHA_MAX_ENTRY_NAME, header.fileNameLength - nameTableOffset))
      : undefined;
    const identifier = name !== undefined && name.length > 0 ? name : `entry-${index}`;
    entries.push({
      index,
      identifier,
      name: name !== undefined && name.length > 0 ? name : undefined,
      typeName,
      typeIndex,
      payloadOffset,
      storedSize,
      contentSize: primaryContentSize + extraContentSize,
      primaryContentSize,
      extraContentSize,
      compression: compressionFromFlag(compressFlag),
      nameTableOffset,
      recordOffset,
      rangeError: rangeError(payloadOffset, storedSize, payloadSize),
    });
  }

  const overlaps: ArchiveOverlap[] = [];
  const ordered = [...entries].sort((left, right) => left.payloadOffset - right.payloadOffset);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (previous.storedSize === 0 || current.storedSize === 0) {
      continue;
    }
    if (previous.payloadOffset + previous.storedSize > current.payloadOffset) {
      overlaps.push({ leftIndex: previous.index, rightIndex: current.index });
    }
  }
  return { entries, overlaps };
}
