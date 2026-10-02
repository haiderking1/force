import { expect, test } from "bun:test";
import { extendEmbeddedFonts } from "./extend-embedded.ts";
import { serializeDefineFont3Tag } from "./serialize.ts";
import { emptySwfRectBytes } from "../rect.ts";
import { emptyFontShapeBytes } from "../shape.ts";
import { encodeSwfTag } from "../rewrite.ts";
import type { DefineFont3Tag } from "./types.ts";

const glyph = { code: 0xe0b6, advance: 500, shapeBytes: emptyFontShapeBytes(), boundsBytes: emptySwfRectBytes() };
function fixture() {
  const font: DefineFont3Tag = {
    id: 1, flags: 0x80, language: 0, name: "Test", nameBytes: new TextEncoder().encode("Test"),
    wideOffsets: false, wideCodes: false, hasLayout: true, ascent: 10000, descent: 2000, leading: 0,
    glyphs: [{ ...glyph, code: 32 }], kerning: [], kerningBytes: new Uint8Array([0, 0]),
  };
  const tag = encodeSwfTag(75, serializeDefineFont3Tag(font));
  const bytes = new Uint8Array(8 + 5 + tag.length + 2);
  bytes.set([70, 87, 83, 8]);
  new DataView(bytes.buffer).setUint32(4, bytes.length, true);
  bytes.set([0, 0, 24, 1, 0], 8);
  bytes.set(tag, 13);
  return bytes;
}

test("embedded font extension preserves existing glyphs and is idempotent", () => {
  const first = extendEmbeddedFonts(fixture(), () => true, [glyph]);
  expect(first.fonts).toEqual([{ name: "Test", id: 1, added: 1, verified: true }]);
  const second = extendEmbeddedFonts(first.bytes, () => true, [glyph]);
  expect(second.changed).toBe(false);
  expect(second.bytes).toEqual(first.bytes);
  expect(second.fonts[0]?.added).toBe(0);
});

test("embedded font extension refuses conflicting glyph codes", () => {
  const first = extendEmbeddedFonts(fixture(), () => true, [glyph]);
  expect(() => extendEmbeddedFonts(first.bytes, () => true, [{ ...glyph, advance: 501 }])).toThrow(/conflicting PUA/);
});

test("unselected embedded fonts remain byte-identical", () => {
  const original = fixture();
  const next = extendEmbeddedFonts(original, () => false, [glyph]);
  expect(next.changed).toBe(false);
  expect(next.bytes).toEqual(original);
});
