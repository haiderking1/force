import { deflateSync } from "node:zlib";
import { writeMsbBits, writeU32Be, writeU64Be } from "./bits.ts";
import {
  BUDDHA_COMPRESS_NONE,
  BUDDHA_COMPRESS_ZLIB,
  BUDDHA_CONTENT_BITS,
  BUDDHA_ENTRY_SIZE,
  BUDDHA_EXTRA_CONTENT_BITS,
  BUDDHA_HEADER_PREFIX_SIZE,
  BUDDHA_RESERVED_BITS,
} from "./limits.ts";

export type FixtureType = {
  readonly name: string;
  readonly unknown1?: number;
  readonly unknown2?: number;
  readonly unknown3?: number;
};

export type FixtureEntry = {
  readonly name: string;
  readonly typeIndex: number;
  readonly bytes: Uint8Array;
  readonly compress: boolean;
  /** Part of bytes.length recorded in the extra content size field. Defaults to 0. */
  readonly extraContentSize?: number;
};

export type BuiltV5Pack = {
  readonly header: Uint8Array;
  readonly payload: Uint8Array;
};

const FILE_TYPE_OFFSET = 2048;

function encodeType(type: FixtureType): Uint8Array {
  const nameBytes = new TextEncoder().encode(`${type.name}\0`);
  const record = new Uint8Array(4 + nameBytes.length + 12);
  writeU32Be(record, 0, nameBytes.length);
  record.set(nameBytes, 4);
  writeU32Be(record, 4 + nameBytes.length, type.unknown1 ?? 0);
  writeU32Be(record, 8 + nameBytes.length, type.unknown2 ?? 0);
  writeU32Be(record, 12 + nameBytes.length, type.unknown3 ?? 0);
  return record;
}

function encodeEntryRecord(
  primaryContentSize: number,
  extraContentSize: number,
  nameOffset: number,
  payloadOffset: number,
  storedSize: number,
  typeIndex: number,
  compressFlag: number,
): Uint8Array {
  const record = new Uint8Array(BUDDHA_ENTRY_SIZE);
  writeMsbBits(record, primaryContentSize, 0, 0, BUDDHA_CONTENT_BITS);
  writeMsbBits(record, nameOffset, 3, 0, 21);
  writeMsbBits(record, extraContentSize, 5, 5, BUDDHA_EXTRA_CONTENT_BITS);
  writeMsbBits(record, 0, 7, 7, BUDDHA_RESERVED_BITS);
  writeMsbBits(record, payloadOffset, 8, 0, 29);
  writeMsbBits(record, storedSize, 11, 5, 23);
  writeMsbBits(record, typeIndex << 1, 14, 4, 8);
  const last = record[15] ?? 0;
  record[15] = (last & 0xf0) | (compressFlag & 0x0f);
  return record;
}

export function buildV5Pack(
  types: readonly FixtureType[],
  entries: readonly FixtureEntry[],
  versionMinor = 0,
): BuiltV5Pack {
  const typeBlob = types.map(encodeType);
  const typeBytes = typeBlob.reduce((sum, item) => sum + item.length, 0);
  const indexOffset = FILE_TYPE_OFFSET + typeBytes + ((16 - ((FILE_TYPE_OFFSET + typeBytes) % 16)) % 16);
  const nameOffsets: number[] = [];
  let nameCursor = 0;
  const nameChunks: Uint8Array[] = [];
  for (const entry of entries) {
    nameOffsets.push(nameCursor);
    const encoded = new TextEncoder().encode(`${entry.name}\0`);
    nameChunks.push(encoded);
    nameCursor += encoded.length;
  }
  const nameTable = new Uint8Array(nameCursor);
  let nameWrite = 0;
  for (const chunk of nameChunks) {
    nameTable.set(chunk, nameWrite);
    nameWrite += chunk.length;
  }
  const nameOffset = indexOffset + entries.length * BUDDHA_ENTRY_SIZE;
  const headerSize = nameOffset + nameTable.length + 8;
  const header = new Uint8Array(headerSize);
  header.set(new TextEncoder().encode("dfpf"), 0);
  header[4] = 5;
  header[5] = versionMinor;
  writeU64Be(header, 8, FILE_TYPE_OFFSET);
  writeU64Be(header, 16, nameOffset);
  writeU32Be(header, 24, types.length);
  writeU32Be(header, 28, nameTable.length);
  writeU32Be(header, 32, entries.length);
  writeU32Be(header, 36, 0x23a1ceab);
  writeU64Be(header, 56, indexOffset);
  writeU64Be(header, 64, nameOffset + nameTable.length);
  writeU64Be(header, 72, headerSize);
  writeU32Be(header, 80, 1);
  writeU32Be(header, 84, 0x23a1ceab);

  let typeWrite = FILE_TYPE_OFFSET;
  for (const blob of typeBlob) {
    header.set(blob, typeWrite);
    typeWrite += blob.length;
  }

  const payloadChunks: Uint8Array[] = [];
  let payloadCursor = 0;
  entries.forEach((entry, index) => {
    const stored = entry.compress ? new Uint8Array(deflateSync(Buffer.from(entry.bytes))) : entry.bytes;
    const extraContentSize = entry.extraContentSize ?? 0;
    if (extraContentSize < 0 || extraContentSize > entry.bytes.length) {
      throw new RangeError(`Fixture ${entry.name} extra content size ${extraContentSize} is outside 0..${entry.bytes.length}`);
    }
    const record = encodeEntryRecord(
      entry.bytes.length - extraContentSize,
      extraContentSize,
      nameOffsets[index] ?? 0,
      payloadCursor,
      stored.length,
      entry.typeIndex,
      entry.compress ? BUDDHA_COMPRESS_ZLIB : BUDDHA_COMPRESS_NONE,
    );
    header.set(record, indexOffset + index * BUDDHA_ENTRY_SIZE);
    payloadChunks.push(stored);
    payloadCursor += stored.length;
  });
  header.set(nameTable, nameOffset);

  const payload = new Uint8Array(payloadCursor);
  let payloadWrite = 0;
  for (const chunk of payloadChunks) {
    payload.set(chunk, payloadWrite);
    payloadWrite += chunk.length;
  }
  writeU64Be(header, 48, payload.length);
  return { header, payload };
}
