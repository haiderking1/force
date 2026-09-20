import { ArchiveError } from "../errors.ts";
import { readU32Be, readU64Be } from "./bits.ts";
import {
  BUDDHA_HEADER_PREFIX_SIZE,
  BUDDHA_MAGIC,
  BUDDHA_MAX_FILE_COUNT,
  BUDDHA_MAX_HEADER_BYTES,
  BUDDHA_MAX_TYPE_COUNT,
  BUDDHA_SUPPORTED_MAJOR,
  BUDDHA_SUPPORTED_MINORS,
} from "./limits.ts";

export type BuddhaHeader = {
  readonly magic: string;
  readonly versionMajor: number;
  readonly versionMinor: number;
  readonly versionBytes: Uint8Array;
  readonly fileTypeOffset: number;
  readonly fileNameOffset: number;
  readonly fileTypeCount: number;
  readonly fileNameLength: number;
  readonly fileCount: number;
  readonly delim1: number;
  readonly unknownOffset: number;
  readonly dataFooterOffset: number;
  readonly fileIndexOffset: number;
  readonly footerOffset1: number;
  readonly footerOffset2: number;
  readonly unknownCount: number;
  readonly delim2: number;
  readonly headerSize: number;
};

function ascii4(data: Uint8Array, offset: number): string {
  return String.fromCharCode(
    data[offset] ?? 0,
    data[offset + 1] ?? 0,
    data[offset + 2] ?? 0,
    data[offset + 3] ?? 0,
  );
}

export function parseBuddhaHeader(bytes: Uint8Array): BuddhaHeader {
  if (bytes.length < BUDDHA_HEADER_PREFIX_SIZE) {
    throw new ArchiveError(
      "MAGIC",
      `Buddha header is ${bytes.length} bytes, shorter than the ${BUDDHA_HEADER_PREFIX_SIZE}-byte prefix`,
    );
  }
  if (bytes.length > BUDDHA_MAX_HEADER_BYTES) {
    throw new ArchiveError("LIMIT", `Buddha header exceeds ${BUDDHA_MAX_HEADER_BYTES} bytes`);
  }
  const magic = ascii4(bytes, 0);
  if (magic !== BUDDHA_MAGIC) {
    throw new ArchiveError("MAGIC", `Expected magic ${BUDDHA_MAGIC}, got ${JSON.stringify(magic)}`);
  }
  const versionMajor = bytes[4] ?? 0;
  const versionMinor = bytes[5] ?? 0;
  if (versionMajor !== BUDDHA_SUPPORTED_MAJOR || !BUDDHA_SUPPORTED_MINORS.includes(versionMinor as 0 | 1)) {
    throw new ArchiveError(
      "VERSION",
      `Unsupported Buddha pack version ${versionMajor}.${versionMinor}. Only ${BUDDHA_SUPPORTED_MAJOR}.0 and ${BUDDHA_SUPPORTED_MAJOR}.1 are implemented (PC Brütal Legend / Stacking index layout).`,
    );
  }

  const fileTypeOffset = readU64Be(bytes, 8);
  const fileNameOffset = readU64Be(bytes, 16);
  const fileTypeCount = readU32Be(bytes, 24);
  const fileNameLength = readU32Be(bytes, 28);
  const fileCount = readU32Be(bytes, 32);
  const delim1 = readU32Be(bytes, 36);
  const unknownOffset = readU64Be(bytes, 40);
  const dataFooterOffset = readU64Be(bytes, 48);
  const fileIndexOffset = readU64Be(bytes, 56);
  const footerOffset1 = readU64Be(bytes, 64);
  const footerOffset2 = readU64Be(bytes, 72);
  const unknownCount = readU32Be(bytes, 80);
  const delim2 = readU32Be(bytes, 84);

  if (fileTypeCount > BUDDHA_MAX_TYPE_COUNT) {
    throw new ArchiveError("LIMIT", `File type count ${fileTypeCount} exceeds ${BUDDHA_MAX_TYPE_COUNT}`);
  }
  if (fileCount > BUDDHA_MAX_FILE_COUNT) {
    throw new ArchiveError("LIMIT", `File count ${fileCount} exceeds ${BUDDHA_MAX_FILE_COUNT}`);
  }
  if (fileTypeOffset < BUDDHA_HEADER_PREFIX_SIZE || fileTypeOffset >= bytes.length) {
    throw new ArchiveError("BOUNDS", `File type table offset ${fileTypeOffset} is outside the header`);
  }
  if (fileIndexOffset < BUDDHA_HEADER_PREFIX_SIZE || fileIndexOffset >= bytes.length) {
    throw new ArchiveError("BOUNDS", `File index offset ${fileIndexOffset} is outside the header`);
  }
  if (fileNameOffset < BUDDHA_HEADER_PREFIX_SIZE || fileNameOffset > bytes.length) {
    throw new ArchiveError("BOUNDS", `File name table offset ${fileNameOffset} is outside the header`);
  }
  if (fileNameOffset + fileNameLength > bytes.length) {
    throw new ArchiveError(
      "BOUNDS",
      `File name table ${fileNameOffset}+${fileNameLength} overruns header size ${bytes.length}`,
    );
  }
  const indexEnd = fileIndexOffset + fileCount * 16;
  if (indexEnd > bytes.length) {
    throw new ArchiveError(
      "BOUNDS",
      `File index ${fileIndexOffset}+${fileCount}*16 overruns header size ${bytes.length}`,
    );
  }
  if (indexEnd > fileNameOffset) {
    throw new ArchiveError("BOUNDS", "File index overlaps the name table");
  }

  return {
    magic,
    versionMajor,
    versionMinor,
    versionBytes: bytes.slice(4, 8),
    fileTypeOffset,
    fileNameOffset,
    fileTypeCount,
    fileNameLength,
    fileCount,
    delim1,
    unknownOffset,
    dataFooterOffset,
    fileIndexOffset,
    footerOffset1,
    footerOffset2,
    unknownCount,
    delim2,
    headerSize: bytes.length,
  };
}
