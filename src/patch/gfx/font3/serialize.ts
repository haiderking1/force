import { PatchError } from "../../errors.ts";
import { i16LeBytes, u16LeBytes, u32LeBytes } from "../swf.ts";
import {
  FONT3_FLAG_HAS_LAYOUT,
  FONT3_FLAG_WIDE_CODES,
  FONT3_FLAG_WIDE_OFFSETS,
  type DefineFont3Tag,
  type Font3KerningRecord,
} from "./types.ts";

const UI16_MAX = 0xffff;
const UI32_MAX = 0xffffffff;

export function encodeFont3KerningBytes(
  wideCodes: boolean,
  records: readonly Font3KerningRecord[],
): Uint8Array {
  if (records.length > UI16_MAX) {
    throw new PatchError("LIMIT", `DefineFont3 kerning count ${records.length} exceeds UI16`);
  }
  const recordSize = wideCodes ? 6 : 4;
  const out = new Uint8Array(2 + records.length * recordSize);
  out.set(u16LeBytes(records.length), 0);
  let offset = 2;
  for (const record of records) {
    if (record.code1 < 0 || record.code2 < 0 || record.code1 > UI16_MAX || record.code2 > UI16_MAX) {
      throw new PatchError("LIMIT", `DefineFont3 kerning code is outside BMP`);
    }
    if (wideCodes) {
      out.set(u16LeBytes(record.code1), offset);
      out.set(u16LeBytes(record.code2), offset + 2);
      out.set(i16LeBytes(record.adjustment), offset + 4);
      offset += 6;
    } else {
      if (record.code1 > 0xff || record.code2 > 0xff) {
        throw new PatchError("LIMIT", `DefineFont3 kerning code exceeds UI8 while wideCodes is clear`);
      }
      out[offset] = record.code1;
      out[offset + 1] = record.code2;
      out.set(i16LeBytes(record.adjustment), offset + 2);
      offset += 4;
    }
  }
  return out;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function serializeDefineFont3Tag(font: DefineFont3Tag): Uint8Array {
  if (font.glyphs.length > UI16_MAX) {
    throw new PatchError("LIMIT", `DefineFont3 ${font.name} glyph count ${font.glyphs.length} exceeds UI16`);
  }
  const needsWideCodes = font.glyphs.some((glyph) => glyph.code > 0xff);
  const wideCodes = font.wideCodes || needsWideCodes;
  if (!wideCodes && font.glyphs.some((glyph) => glyph.code > 0xff)) {
    throw new PatchError("LIMIT", `DefineFont3 ${font.name} has a code outside UI8 and wideCodes is clear`);
  }
  const kerningBytes =
    wideCodes === font.wideCodes ? font.kerningBytes : encodeFont3KerningBytes(wideCodes, font.kerning);

  const shapeBytes = font.glyphs.map((glyph) => glyph.shapeBytes);
  const shapesSize = shapeBytes.reduce((sum, bytes) => sum + bytes.length, 0);

  let wideOffsets = font.wideOffsets;
  const offsetCount = font.glyphs.length + 1;
  const tryNarrowTable = offsetCount * 2;
  const tryWideTable = offsetCount * 4;
  const narrowCodeOffset = tryNarrowTable + shapesSize;
  if (!wideOffsets && narrowCodeOffset > UI16_MAX) {
    wideOffsets = true;
  }
  const offsetSize = wideOffsets ? 4 : 2;
  const offsetTableSize = offsetCount * offsetSize;
  const codeTableOffset = offsetTableSize + shapesSize;
  if (!wideOffsets && codeTableOffset > UI16_MAX) {
    throw new PatchError("LIMIT", `DefineFont3 ${font.name} code table offset ${codeTableOffset} exceeds UI16`);
  }
  if (wideOffsets && codeTableOffset > UI32_MAX) {
    throw new PatchError("LIMIT", `DefineFont3 ${font.name} code table offset exceeds UI32`);
  }

  let flags = font.flags;
  if (wideOffsets) {
    flags |= FONT3_FLAG_WIDE_OFFSETS;
  } else {
    flags &= ~FONT3_FLAG_WIDE_OFFSETS;
  }
  if (wideCodes) {
    flags |= FONT3_FLAG_WIDE_CODES;
  }
  if (font.hasLayout) {
    flags |= FONT3_FLAG_HAS_LAYOUT;
  }

  const header = new Uint8Array(5 + font.nameBytes.length + 2);
  header[0] = font.id & 0xff;
  header[1] = (font.id >> 8) & 0xff;
  header[2] = flags;
  header[3] = font.language;
  header[4] = font.nameBytes.length;
  header.set(font.nameBytes, 5);
  header.set(u16LeBytes(font.glyphs.length), 5 + font.nameBytes.length);

  const offsets: number[] = [];
  let shapeCursor = offsetTableSize;
  for (const shape of shapeBytes) {
    offsets.push(shapeCursor);
    shapeCursor += shape.length;
  }

  const offsetTable = new Uint8Array(offsetTableSize);
  for (let index = 0; index < offsets.length; index += 1) {
    const value = offsets[index] ?? 0;
    if (wideOffsets) {
      offsetTable.set(u32LeBytes(value), index * 4);
    } else {
      offsetTable.set(u16LeBytes(value), index * 2);
    }
  }
  if (wideOffsets) {
    offsetTable.set(u32LeBytes(codeTableOffset), font.glyphs.length * 4);
  } else {
    offsetTable.set(u16LeBytes(codeTableOffset), font.glyphs.length * 2);
  }

  const codeTable = new Uint8Array(font.glyphs.length * (wideCodes ? 2 : 1));
  for (let index = 0; index < font.glyphs.length; index += 1) {
    const code = font.glyphs[index]?.code ?? 0;
    if (code < 0 || code > 0xffff) {
      throw new PatchError("LIMIT", `DefineFont3 ${font.name} code ${code} is outside BMP`);
    }
    if (wideCodes) {
      codeTable.set(u16LeBytes(code), index * 2);
    } else {
      codeTable[index] = code;
    }
  }

  const chunks: Uint8Array[] = [header, offsetTable, ...shapeBytes, codeTable];
  if (font.hasLayout) {
    chunks.push(i16LeBytes(font.ascent), i16LeBytes(font.descent), i16LeBytes(font.leading));
    for (const glyph of font.glyphs) {
      chunks.push(i16LeBytes(glyph.advance));
    }
    for (const glyph of font.glyphs) {
      chunks.push(glyph.boundsBytes);
    }
    chunks.push(kerningBytes);
  }
  return concat(chunks);
}
