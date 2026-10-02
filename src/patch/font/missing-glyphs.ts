import type { Font3AppendedGlyph } from "../gfx/font3/types.ts";
import { sha256Bytes } from "../hash.ts";

/** Deduplicate exact outlines/advances and allocate only absent glyphs. */
export function missingGlyphs(generated: readonly Font3AppendedGlyph[], installed: readonly Font3AppendedGlyph[], firstCode: number) {
  const key = (g: Font3AppendedGlyph) => `${g.advance}:${sha256Bytes(g.shapeBytes)}:${sha256Bytes(g.boundsBytes)}`;
  const existing = new Set(installed.map(key));
  const result: Font3AppendedGlyph[] = [];
  for (const glyph of generated) {
    if (existing.has(key(glyph))) continue;
    const code = firstCode + result.length;
    if (code < 0xe000 || code > 0xf8ff) throw new Error("Missing-glyph allocation outside BMP PUA");
    result.push({ ...glyph, code }); existing.add(key(glyph));
  }
  return result;
}
