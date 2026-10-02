import { PatchError } from "../errors.ts";
import { appendFont3Glyphs } from "../gfx/font3/append.ts";
import { parseDefineFont3Tag } from "../gfx/font3/parse.ts";
import { serializeDefineFont3Tag } from "../gfx/font3/serialize.ts";
import type { Font3AppendedGlyph } from "../gfx/font3/types.ts";
import { sha256Bytes } from "../hash.ts";
import { rebuildGfxFile } from "../gfx/rewrite.ts";
import { decompressGfx, walkSwfTags } from "../gfx/swf.ts";

export function appendGlyphsToNamedFonts(
  bytes: Uint8Array,
  names: readonly string[],
  glyphs: readonly Font3AppendedGlyph[],
): {
  readonly next: Uint8Array;
  readonly rewritten: readonly { readonly name: string; readonly firstCode: number; readonly addedGlyphs: number }[];
} {
  const wanted = new Set(names);
  const walked = walkSwfTags(decompressGfx(bytes).body);
  const replacements = new Map<number, Uint8Array>();
  const rewritten: { name: string; firstCode: number; addedGlyphs: number }[] = [];
  for (const tag of walked.tags) {
    if (tag.type !== 75) {
      continue;
    }
    const original = parseDefineFont3Tag(tag.data);
    if (!wanted.has(original.name)) {
      continue;
    }
    const nextFont = serializeDefineFont3Tag(appendFont3Glyphs(original, glyphs));
    const verified = parseDefineFont3Tag(nextFont);
    for (const [index, glyph] of original.glyphs.entries()) {
      const next = verified.glyphs[index];
      if (
        !next ||
        glyph.code !== next.code ||
        glyph.advance !== next.advance ||
        sha256Bytes(glyph.shapeBytes) !== sha256Bytes(next.shapeBytes) ||
        sha256Bytes(glyph.boundsBytes) !== sha256Bytes(next.boundsBytes)
      ) {
        throw new PatchError("ROUNDTRIP", `Font ${original.name} changed an existing glyph`);
      }
    }
    for (const glyph of glyphs) {
      const next = verified.glyphs.find((item) => item.code === glyph.code);
      if (!next || next.advance !== glyph.advance || sha256Bytes(next.shapeBytes) !== sha256Bytes(glyph.shapeBytes)) {
        throw new PatchError("ROUNDTRIP", `Font ${original.name} failed a new glyph round trip`);
      }
    }
    replacements.set(tag.offset, nextFont);
    rewritten.push({
      name: original.name,
      firstCode: glyphs[0]?.code ?? Math.max(0xe000, ...original.glyphs.map((glyph) => glyph.code + 1)),
      addedGlyphs: glyphs.length,
    });
  }
  const missing = names.filter((name) => !rewritten.some((item) => item.name === name));
  if (missing.length > 0) {
    throw new PatchError("GFX", `englishfonts is missing DefineFont3 families ${missing.join(", ")}`);
  }
  return { next: rebuildGfxFile(bytes, replacements), rewritten };
}

export function nextPuaCode(bytes: Uint8Array, fontName: string): number {
  const tags = walkSwfTags(decompressGfx(bytes).body).tags.filter((tag) => tag.type === 75);
  const matching = tags.filter((tag) => parseDefineFont3Tag(tag.data).name === fontName);
  const tag = matching[0];
  if (!tag || matching.length !== 1) {
    throw new PatchError("GFX", `Expected one ${fontName} font`);
  }
  const original = parseDefineFont3Tag(tag.data);
  return Math.max(0xe000, ...original.glyphs.map((glyph) => glyph.code + 1));
}
