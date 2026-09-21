import { PatchError } from "../../errors.ts";
import { encodeFont3KerningBytes } from "./serialize.ts";
import type { DefineFont3Tag, Font3AppendedGlyph, Font3Glyph } from "./types.ts";

const UI16_MAX = 0xffff;
const SI16_MIN = -32768;
const SI16_MAX = 32767;
const PUA_FIRST = 0xe000;
const PUA_LAST = 0xf8ff;

function assertAdvance(name: string, code: number, advance: number): void {
  if (!Number.isInteger(advance) || advance < SI16_MIN || advance > SI16_MAX) {
    throw new PatchError(
      "LIMIT",
      `DefineFont3 ${name} appended code U+${code.toString(16)} advance ${advance} exceeds SI16`,
    );
  }
}

export function appendFont3Glyphs(font: DefineFont3Tag, appended: readonly Font3AppendedGlyph[]): DefineFont3Tag {
  if (appended.length === 0) {
    return font;
  }
  if (!font.hasLayout) {
    throw new PatchError("GFX", `DefineFont3 ${font.name} has no layout table; refusing to append glyphs`);
  }
  const used = new Set(font.glyphs.map((glyph) => glyph.code));
  let lastCode = font.glyphs.length === 0 ? -1 : font.glyphs[font.glyphs.length - 1]?.code ?? -1;
  const nextGlyphs: Font3Glyph[] = [...font.glyphs];
  for (const glyph of appended) {
    if (glyph.code < PUA_FIRST || glyph.code > PUA_LAST) {
      throw new PatchError("GFX", `Appended font code U+${glyph.code.toString(16)} is outside BMP PUA`);
    }
    if (used.has(glyph.code)) {
      throw new PatchError("GFX", `DefineFont3 ${font.name} already maps U+${glyph.code.toString(16)}`);
    }
    if (glyph.code < lastCode) {
      throw new PatchError(
        "GFX",
        `DefineFont3 ${font.name} appended codes must stay sorted; U+${glyph.code.toString(16)} follows U+${lastCode.toString(16)}`,
      );
    }
    if (nextGlyphs.length + 1 > UI16_MAX) {
      throw new PatchError("LIMIT", `DefineFont3 ${font.name} cannot append another glyph`);
    }
    assertAdvance(font.name, glyph.code, glyph.advance);
    if (glyph.shapeBytes.length === 0) {
      throw new PatchError("GFX", `DefineFont3 ${font.name} appended U+${glyph.code.toString(16)} has an empty SHAPE`);
    }
    if (glyph.boundsBytes.length === 0) {
      throw new PatchError("GFX", `DefineFont3 ${font.name} appended U+${glyph.code.toString(16)} has empty bounds bytes`);
    }
    used.add(glyph.code);
    lastCode = glyph.code;
    nextGlyphs.push({
      shapeBytes: glyph.shapeBytes,
      code: glyph.code,
      advance: glyph.advance,
      boundsBytes: glyph.boundsBytes,
    });
  }
  const wideCodes = font.wideCodes || nextGlyphs.some((glyph) => glyph.code > 0xff);
  return {
    ...font,
    wideCodes,
    kerningBytes: wideCodes === font.wideCodes ? font.kerningBytes : encodeFont3KerningBytes(wideCodes, font.kerning),
    glyphs: nextGlyphs,
  };
}

export function font3CodeMap(font: DefineFont3Tag): Map<number, Font3Glyph> {
  const map = new Map<number, Font3Glyph>();
  for (const glyph of font.glyphs) {
    map.set(glyph.code, glyph);
  }
  return map;
}
