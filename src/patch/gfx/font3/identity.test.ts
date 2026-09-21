import { expect, test } from "bun:test";
import { emptySwfRectBytes, encodeSwfRect, parseSwfRect } from "../rect.ts";
import { emptyFontShapeBytes, encodeFontShape, parseFontShape } from "../shape.ts";
import { appendFont3Glyphs } from "./append.ts";
import { parseDefineFont3Tag } from "./parse.ts";
import { serializeDefineFont3Tag } from "./serialize.ts";
import type { DefineFont3Tag } from "./types.ts";

function sampleFont(): DefineFont3Tag {
  const space = emptyFontShapeBytes();
  const mark = encodeFontShape([
    { kind: "move", x: 20, y: -40, fillStyle0: 1 },
    { kind: "line", x: 80, y: -40 },
    { kind: "line", x: 80, y: 10 },
    { kind: "line", x: 20, y: 10 },
    { kind: "line", x: 20, y: -40 },
  ]);
  return {
    id: 3,
    flags: 0x84,
    language: 1,
    nameBytes: new TextEncoder().encode("TG_Menu"),
    name: "TG_Menu",
    wideOffsets: false,
    wideCodes: true,
    hasLayout: true,
    ascent: 20740,
    descent: 5120,
    leading: 5380,
    glyphs: [
      { shapeBytes: space, code: 32, advance: 7400, boundsBytes: emptySwfRectBytes() },
      { shapeBytes: mark, code: 65, advance: 18200, boundsBytes: encodeSwfRect(20, 80, -40, 10) },
    ],
    kerning: [],
    kerningBytes: new Uint8Array([0, 0]),
  };
}

test("empty font SHAPE matches the production space glyph", () => {
  expect([...emptyFontShapeBytes()]).toEqual([0x10, 0x00]);
});

test("RECT nbits=0 empty encode is one zero byte and parses back", () => {
  const bytes = emptySwfRectBytes();
  const parsed = parseSwfRect(bytes, 0);
  expect(parsed.xMin).toBe(0);
  expect(parsed.xMax).toBe(0);
  expect(parsed.yMin).toBe(0);
  expect(parsed.yMax).toBe(0);
});

test("DefineFont3 identity serialize matches the builder bytes", () => {
  const font = sampleFont();
  const bytes = serializeDefineFont3Tag(font);
  const parsed = parseDefineFont3Tag(bytes);
  const again = serializeDefineFont3Tag(parsed);
  expect(again).toEqual(bytes);
  expect(parsed.name).toBe("TG_Menu");
  expect(parsed.glyphs.map((glyph) => glyph.code)).toEqual([32, 65]);
  expect(parsed.glyphs[1]?.advance).toBe(18200);
});

test("appending a PUA glyph preserves original shapes and grows wideOffsets when needed", () => {
  const font = sampleFont();
  const huge = encodeFontShape([
    { kind: "move", x: 0, y: 0, fillStyle0: 1 },
    { kind: "line", x: 100, y: 0 },
  ]);
  const bulky = new Uint8Array(70000);
  bulky.set(huge, 0);
  bulky.fill(0, huge.length);
  const appended = appendFont3Glyphs(parseDefineFont3Tag(serializeDefineFont3Tag(font)), [
    {
      code: 0xe000,
      shapeBytes: bulky,
      advance: 1200,
      boundsBytes: encodeSwfRect(0, 100, 0, 0),
    },
  ]);
  const bytes = serializeDefineFont3Tag(appended);
  const parsed = parseDefineFont3Tag(bytes);
  expect(parsed.wideOffsets).toBe(true);
  expect(parsed.glyphs[0]?.code).toBe(32);
  expect(parsed.glyphs[0]?.shapeBytes).toEqual(emptyFontShapeBytes());
  expect(parsed.glyphs[2]?.code).toBe(0xe000);
  expect(parsed.glyphs[2]?.advance).toBe(1200);
  const shape = parseFontShape(parsed.glyphs[1]?.shapeBytes ?? new Uint8Array(), 0, parsed.glyphs[1]?.shapeBytes.length ?? 0);
  expect(shape.records[0]?.kind).toBe("move");
});

test("appending PUA to a narrow-code Font3 grows wideCodes and rewrites kerning", () => {
  const font: DefineFont3Tag = {
    ...sampleFont(),
    flags: 0x80,
    wideCodes: false,
    kerning: [{ code1: 32, code2: 65, adjustment: -80 }],
    kerningBytes: new Uint8Array([1, 0, 32, 65, 176, 255]),
  };
  const identity = serializeDefineFont3Tag(font);
  const parsedIdentity = parseDefineFont3Tag(identity);
  expect(parsedIdentity.wideCodes).toBe(false);
  expect(parsedIdentity.kerning).toEqual([{ code1: 32, code2: 65, adjustment: -80 }]);

  const appended = appendFont3Glyphs(parsedIdentity, [
    {
      code: 0xe000,
      shapeBytes: emptyFontShapeBytes(),
      advance: 900,
      boundsBytes: emptySwfRectBytes(),
    },
  ]);
  expect(appended.wideCodes).toBe(true);
  const bytes = serializeDefineFont3Tag(appended);
  const parsed = parseDefineFont3Tag(bytes);
  expect(parsed.wideCodes).toBe(true);
  expect(parsed.glyphs.map((glyph) => glyph.code)).toEqual([32, 65, 0xe000]);
  expect(parsed.glyphs[0]?.advance).toBe(7400);
  expect(parsed.glyphs[2]?.advance).toBe(900);
  expect(parsed.kerning).toEqual([{ code1: 32, code2: 65, adjustment: -80 }]);
});

test("rejects Font3 appends outside BMP PUA and SI16 advances", () => {
  const font = sampleFont();
  expect(() =>
    appendFont3Glyphs(font, [{ code: 0x0600, shapeBytes: emptyFontShapeBytes(), advance: 1, boundsBytes: emptySwfRectBytes() }]),
  ).toThrow(/PUA/);
  expect(() =>
    appendFont3Glyphs(font, [{ code: 0xe000, shapeBytes: emptyFontShapeBytes(), advance: 40000, boundsBytes: emptySwfRectBytes() }]),
  ).toThrow(/SI16/);
});
