import { PatchError } from "../../errors.ts";
import { parseSwfRect } from "../rect.ts";
import { readI16Le, readU16Le, readU32Le } from "../swf.ts";
import {
  DEFINE_FONT3_TAG,
  FONT3_FLAG_HAS_LAYOUT,
  FONT3_FLAG_WIDE_CODES,
  FONT3_FLAG_WIDE_OFFSETS,
  type DefineFont3Tag,
  type Font3Glyph,
  type Font3KerningRecord,
} from "./types.ts";

function readName(data: Uint8Array): { readonly nameBytes: Uint8Array; readonly name: string; readonly afterName: number } {
  const nameLen = data[4];
  if (nameLen === undefined || 5 + nameLen + 2 > data.length) {
    throw new PatchError("GFX", "DefineFont3 name overruns the tag");
  }
  const nameBytes = data.subarray(5, 5 + nameLen);
  return {
    nameBytes,
    name: new TextDecoder("latin1").decode(nameBytes).replaceAll("\0", ""),
    afterName: 5 + nameLen,
  };
}

export function parseDefineFont3Tag(data: Uint8Array): DefineFont3Tag {
  if (data.length < 8) {
    throw new PatchError("GFX", "DefineFont3 tag is shorter than the fixed header");
  }
  const id = readU16Le(data, 0);
  const flags = data[2];
  const language = data[3];
  if (flags === undefined || language === undefined) {
    throw new PatchError("GFX", "DefineFont3 flags are missing");
  }
  const wideOffsets = (flags & FONT3_FLAG_WIDE_OFFSETS) !== 0;
  const wideCodes = (flags & FONT3_FLAG_WIDE_CODES) !== 0;
  const hasLayout = (flags & FONT3_FLAG_HAS_LAYOUT) !== 0;
  const named = readName(data);
  const glyphCount = readU16Le(data, named.afterName);
  const offsetSize = wideOffsets ? 4 : 2;
  const offsetTableStart = named.afterName + 2;
  const offsetTableBytes = (glyphCount + 1) * offsetSize;
  if (offsetTableStart + offsetTableBytes > data.length) {
    throw new PatchError("GFX", `DefineFont3 ${named.name} offset table overruns the tag`);
  }
  const offsets: number[] = [];
  for (let index = 0; index < glyphCount; index += 1) {
    const at = offsetTableStart + index * offsetSize;
    offsets.push(wideOffsets ? readU32Le(data, at) : readU16Le(data, at));
  }
  const codeTableOffset = wideOffsets
    ? readU32Le(data, offsetTableStart + glyphCount * offsetSize)
    : readU16Le(data, offsetTableStart + glyphCount * offsetSize);
  const codeTableAbs = offsetTableStart + codeTableOffset;
  const codeWidth = wideCodes ? 2 : 1;
  if (codeTableAbs + glyphCount * codeWidth > data.length) {
    throw new PatchError("GFX", `DefineFont3 ${named.name} code table overruns the tag`);
  }
  const codes: number[] = [];
  for (let index = 0; index < glyphCount; index += 1) {
    codes.push(wideCodes ? readU16Le(data, codeTableAbs + index * 2) : (data[codeTableAbs + index] ?? 0));
  }
  const glyphs: Font3Glyph[] = [];
  for (let index = 0; index < glyphCount; index += 1) {
    const start = offsets[index];
    const end = index + 1 < glyphCount ? offsets[index + 1] : codeTableOffset;
    if (start === undefined || end === undefined || start < 0 || end < start) {
      throw new PatchError("GFX", `DefineFont3 ${named.name} glyph ${index} has invalid offsets`);
    }
    const absStart = offsetTableStart + start;
    const absEnd = offsetTableStart + end;
    if (absEnd > codeTableAbs) {
      throw new PatchError("GFX", `DefineFont3 ${named.name} glyph ${index} overlaps the code table`);
    }
    glyphs.push({
      shapeBytes: data.subarray(absStart, absEnd),
      code: codes[index] ?? 0,
      advance: 0,
      boundsBytes: new Uint8Array(),
    });
  }

  let pos = codeTableAbs + glyphCount * codeWidth;
  let ascent = 0;
  let descent = 0;
  let leading = 0;
  const kerning: Font3KerningRecord[] = [];
  let kerningBytes = new Uint8Array();
  if (hasLayout) {
    if (pos + 6 + glyphCount * 2 > data.length) {
      throw new PatchError("GFX", `DefineFont3 ${named.name} layout header overruns the tag`);
    }
    ascent = readI16Le(data, pos);
    descent = readI16Le(data, pos + 2);
    leading = readI16Le(data, pos + 4);
    pos += 6;
    for (let index = 0; index < glyphCount; index += 1) {
      const glyph = glyphs[index];
      if (glyph === undefined) {
        throw new PatchError("GFX", `DefineFont3 ${named.name} advance table is missing glyph ${index}`);
      }
      glyphs[index] = { ...glyph, advance: readI16Le(data, pos) };
      pos += 2;
    }
    for (let index = 0; index < glyphCount; index += 1) {
      const glyph = glyphs[index];
      if (glyph === undefined) {
        throw new PatchError("GFX", `DefineFont3 ${named.name} bounds table is missing glyph ${index}`);
      }
      const rect = parseSwfRect(data, pos);
      glyphs[index] = { ...glyph, boundsBytes: rect.bytes };
      pos += rect.bytes.length;
    }
    if (pos + 2 > data.length) {
      throw new PatchError("GFX", `DefineFont3 ${named.name} kerning count overruns the tag`);
    }
    const kerningCount = readU16Le(data, pos);
    const recordSize = wideCodes ? 6 : 4;
    const kerningStart = pos;
    pos += 2;
    if (pos + kerningCount * recordSize > data.length) {
      throw new PatchError("GFX", `DefineFont3 ${named.name} kerning table overruns the tag`);
    }
    for (let index = 0; index < kerningCount; index += 1) {
      const code1 = wideCodes ? readU16Le(data, pos) : (data[pos] ?? 0);
      const code2 = wideCodes ? readU16Le(data, pos + 2) : (data[pos + 1] ?? 0);
      const adjustment = readI16Le(data, pos + (wideCodes ? 4 : 2));
      kerning.push({ code1, code2, adjustment });
      pos += recordSize;
    }
    kerningBytes = Uint8Array.from(data.subarray(kerningStart, pos));
    if (pos !== data.length) {
      throw new PatchError("GFX", `DefineFont3 ${named.name} has ${data.length - pos} unexpected trailing bytes`);
    }
  } else if (pos !== data.length) {
    throw new PatchError("GFX", `DefineFont3 ${named.name} has unexpected bytes after the code table`);
  }

  return {
    id,
    flags,
    language,
    nameBytes: named.nameBytes,
    name: named.name,
    wideOffsets,
    wideCodes,
    hasLayout,
    ascent,
    descent,
    leading,
    glyphs,
    kerning,
    kerningBytes,
  };
}

export function assertDefineFont3Tag(tagType: number, name: string): void {
  if (tagType !== DEFINE_FONT3_TAG) {
    throw new PatchError(
      "GFX",
      `Only DefineFont3 is implemented; ${name} is tag ${tagType} and cannot be rewritten`,
    );
  }
}
