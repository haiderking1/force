import { FontError } from "../errors.ts";

export type SfntTableEntry = {
  readonly tag: string;
  readonly checksum: number;
  readonly offset: number;
  readonly length: number;
};

export function parseSfntDirectory(bytes: Uint8Array): Map<string, SfntTableEntry> {
  if (bytes.length < 12) {
    throw new FontError("font file is truncated: smaller than SFNT header", "TRUNCATED_FONT");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const b0 = bytes[0] ?? 0;
  const b1 = bytes[1] ?? 0;
  const b2 = bytes[2] ?? 0;
  const b3 = bytes[3] ?? 0;
  const sfntVersion = String.fromCharCode(b0, b1, b2, b3);

  const validVersions = ["OTTO", "\0\x01\0\0", "true", "typ1"];
  const isValidVersion =
    validVersions.includes(sfntVersion) ||
    (b0 === 0 && b1 === 1 && b2 === 0 && b3 === 0);

  if (!isValidVersion) {
    throw new FontError("input font is not an SFNT font", "INVALID_SFNT");
  }

  const numTables = view.getUint16(4, false);
  if (bytes.length < 12 + numTables * 16) {
    throw new FontError("font file is truncated: cannot read table directory", "TRUNCATED_FONT");
  }

  const tables = new Map<string, SfntTableEntry>();
  for (let i = 0; i < numTables; i += 1) {
    const recordOffset = 12 + i * 16;
    const tag = String.fromCharCode(
      bytes[recordOffset] ?? 0,
      bytes[recordOffset + 1] ?? 0,
      bytes[recordOffset + 2] ?? 0,
      bytes[recordOffset + 3] ?? 0,
    );
    const checksum = view.getUint32(recordOffset + 4, false);
    const offset = view.getUint32(recordOffset + 8, false);
    const length = view.getUint32(recordOffset + 12, false);

    if (offset + length > bytes.length) {
      throw new FontError(`font table ${tag} extends beyond file boundary`, "TABLE_OUT_OF_BOUNDS");
    }

    if (tables.has(tag)) {
      throw new FontError(`duplicate table tag ${tag} in SFNT directory`, "DUPLICATE_TABLE");
    }

    tables.set(tag, { tag, checksum, offset, length });
  }

  return tables;
}

export function fontLineUnits(fontBytes: Uint8Array): number {
  const tables = parseSfntDirectory(fontBytes);
  const hhea = tables.get("hhea");
  if (!hhea) {
    throw new FontError("font has no hhea table", "MISSING_HHEA");
  }

  if (hhea.length < 36) {
    throw new FontError("hhea table is too short", "MALFORMED_HHEA");
  }

  const view = new DataView(fontBytes.buffer, fontBytes.byteOffset + hhea.offset, hhea.length);
  const ascender = view.getInt16(4, false);
  const descender = view.getInt16(6, false);
  const lineGap = view.getInt16(8, false);

  const result = ascender - descender + lineGap;
  if (result <= 0) {
    throw new FontError("invalid font line metrics", "INVALID_LINE_METRICS");
  }

  return result;
}
