import { PatchError } from "../../errors.ts";
import { sha256Bytes } from "../../hash.ts";
import { rebuildGfxFile } from "../rewrite.ts";
import { decompressGfx, walkSwfTags } from "../swf.ts";
import { appendFont3Glyphs } from "./append.ts";
import { parseDefineFont3Tag } from "./parse.ts";
import { serializeDefineFont3Tag } from "./serialize.ts";
import type { DefineFont3Tag, Font3AppendedGlyph } from "./types.ts";

function equalGlyph(a: Font3AppendedGlyph, b: Font3AppendedGlyph): boolean {
  return a.code === b.code && a.advance === b.advance &&
    sha256Bytes(a.shapeBytes) === sha256Bytes(b.shapeBytes) &&
    sha256Bytes(a.boundsBytes) === sha256Bytes(b.boundsBytes);
}

/** Append only missing codes, keeping existing glyph indices and rejecting collisions. */
export function extendEmbeddedFonts(
  bytes: Uint8Array,
  select: (font: DefineFont3Tag) => boolean,
  glyphs: readonly Font3AppendedGlyph[],
) {
  if (!glyphs.length) throw new PatchError("VALIDATION", "No donor glyphs supplied");
  const tags = walkSwfTags(decompressGfx(bytes).body).tags;
  const replacements = new Map<number, Uint8Array>();
  const fonts: { name: string; id: number; added: number; verified: boolean }[] = [];
  for (const tag of tags) {
    // Import stubs have no layout table and are not writable outline fonts.
    if (tag.type !== 75 || ((tag.data[2] ?? 0) & 0x80) === 0) continue;
    const original = parseDefineFont3Tag(tag.data);
    if (!select(original)) continue;
    const existing = new Map(original.glyphs.map((glyph) => [glyph.code, glyph]));
    for (const glyph of glyphs) {
      const previous = existing.get(glyph.code);
      if (previous && !equalGlyph(previous, glyph)) {
        throw new PatchError("GFX", `${original.name}: conflicting PUA U+${glyph.code.toString(16)}`);
      }
    }
    const missing = glyphs.filter((glyph) => !existing.has(glyph.code));
    const serialized = serializeDefineFont3Tag(appendFont3Glyphs(original, missing));
    const verified = parseDefineFont3Tag(serialized);
    for (const [index, glyph] of original.glyphs.entries()) {
      const next = verified.glyphs[index];
      if (!next || !equalGlyph(next, glyph)) throw new PatchError("ROUNDTRIP", "Existing glyph changed");
    }
    const codes = new Map(verified.glyphs.map((glyph) => [glyph.code, glyph]));
    for (const glyph of glyphs) {
      const next = codes.get(glyph.code);
      if (!next || !equalGlyph(next, glyph)) throw new PatchError("ROUNDTRIP", "Donor glyph differs");
    }
    if (missing.length) replacements.set(tag.offset, serialized);
    fonts.push({ name: original.name, id: original.id, added: missing.length, verified: true });
  }
  const next = replacements.size ? rebuildGfxFile(bytes, replacements) : bytes;
  const after = walkSwfTags(decompressGfx(next).body).tags;
  if (after.length !== tags.length) throw new PatchError("ROUNDTRIP", "GFX tag count changed");
  for (const [index, tag] of tags.entries()) {
    const check = after[index];
    if (!check || check.type !== tag.type ||
        sha256Bytes(check.data) !== sha256Bytes(replacements.get(tag.offset) ?? tag.data)) {
      throw new PatchError("ROUNDTRIP", "GFX changed outside selected font tags");
    }
  }
  return { bytes: next, fonts, changed: replacements.size > 0 };
}
