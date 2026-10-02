import type { Font3AppendedGlyph } from "../gfx/font3/types.ts";
import { sha256Bytes } from "../hash.ts";
import { PatchError } from "../errors.ts";

function identity(glyph: Font3AppendedGlyph): string {
  return `${glyph.advance}:${sha256Bytes(glyph.shapeBytes)}:${sha256Bytes(glyph.boundsBytes)}`;
}

/** Reuse installed outline codes, without reallocating or changing any font. */
export function remapToInstalledGlyphs(
  generated: readonly Font3AppendedGlyph[], installed: readonly Font3AppendedGlyph[],
): (text: string) => string {
  const byShape = new Map(installed.map((glyph) => [identity(glyph), glyph.code]));
  const codes = new Map<number, number>();
  for (const glyph of generated) {
    const code = byShape.get(identity(glyph));
    if (code === undefined) throw new PatchError("GFX", `No installed outline for generated U+${glyph.code.toString(16)}`);
    codes.set(glyph.code, code);
  }
  return (text) => Array.from(text, (char) => {
    const code = char.codePointAt(0);
    const mapped = code === undefined ? undefined : codes.get(code);
    return mapped === undefined ? char : String.fromCodePoint(mapped);
  }).join("");
}
