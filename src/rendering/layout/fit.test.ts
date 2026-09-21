import { describe, expect, it } from "bun:test";
import { Shaper } from "../font/shaper.ts";
import { fontLineUnits } from "../font/metrics.ts";
import { PuaAllocator } from "./pua.ts";
import { plainSource } from "./source.ts";
import { fitText } from "./fit.ts";
import { widthUnits } from "./profile.ts";
import { encodeRun, fitsGlyph } from "./encode.ts";
import { decodeUtf8 } from "../unicode/utf8.ts";
import { composeOutline, translatedOutline, appendOutline } from "../font/outline.ts";
import { LayoutOverflowError, UnsupportedCharacterError } from "../errors.ts";
import type { GlyphOutline, OutlineCommand, Run } from "../types.ts";
import { readFileSync } from "fs";

const FONT_PATH = "assets/fonts/force.ttf";

function commandsEqual(a: readonly OutlineCommand[], b: readonly OutlineCommand[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const ca = a[i];
    const cb = b[i];
    if (!ca || !cb) return false;
    if (ca.op !== cb.op) return false;
    if (ca.a.x !== cb.a.x || ca.a.y !== cb.a.y) return false;
    if (ca.op === "cubic") {
      if (ca.b?.x !== cb.b?.x || ca.b?.y !== cb.b?.y) return false;
      if (ca.c?.x !== cb.c?.x || ca.c?.y !== cb.c?.y) return false;
    }
    if (ca.op === "quad") {
      if (ca.b?.x !== cb.b?.x || ca.b?.y !== cb.b?.y) return false;
    }
  }
  return true;
}

describe("Layout Fitting and Encoding", () => {
  const fontBytes = new Uint8Array(readFileSync(FONT_PATH));

  it("shared layout fits real Arabic and emits matching font advances", () => {
    const shaper = Shaper.open(FONT_PATH);
    const allocator = new PuaAllocator(shaper.cmap(), []);
    const profile = { width: 300, size: 36, height: 240, minimumSize: 18, padding: 12, lineGap: 4 };
    const input = plainSource("مرحبا بالعالم. إصدار Ren'Py 8.0.3 يعمل هنا.\n  نعم\n");
    const lineUnits = fontLineUnits(fontBytes);
    const fitted = fitText(input, profile, shaper, allocator, lineUnits);

    expect(fitted.size).toBeGreaterThanOrEqual(18);
    expect(fitted.size).toBeLessThanOrEqual(36);
    expect(fitted.lines).toBeGreaterThanOrEqual(3);

    const budget = widthUnits(profile, fitted.size, shaper.unitsPerEm());
    let width = 0;
    let newlines = 0;

    for (const span of fitted.spans) {
      expect(span.styles).toEqual([]);
      for (const cp of decodeUtf8(span.text)) {
        if (cp === 0x000a) {
          expect(width).toBeLessThanOrEqual(budget);
          width = 0;
          newlines += 1;
          continue;
        }

        const mapping = allocator.mappings().find((m) => m.codepoint === cp);
        expect(mapping).toBeDefined();
        if (!mapping) continue;

        const isSpacer = mapping.direction === "spacer";
        const shape = shaper.shape(isSpacer ? " " : mapping.token, isSpacer ? "ltr" : mapping.direction);
        width += shape.advance();
      }
    }

    expect(width).toBeLessThanOrEqual(budget);
    expect(newlines + 1).toBe(fitted.lines);
  });

  it("shared layout failure does not consume glyph mappings", () => {
    const shaper = Shaper.open(FONT_PATH);
    const allocator = new PuaAllocator(shaper.cmap(), []);
    const before = allocator.mappings().length;

    let rejected = false;
    try {
      fitText(plainSource("مرحبا"), { width: 1, size: 36, height: 100, minimumSize: 32 }, shaper, allocator, 2048);
    } catch (err) {
      if (err instanceof LayoutOverflowError) {
        rejected = true;
      }
    }
    expect(rejected).toBe(true);
    expect(allocator.mappings().length).toBe(before);

    // Tab character is unsupported in plain source
    expect(() => plainSource("مرحبا\tبالعالم")).toThrow(UnsupportedCharacterError);
  });

  it("shared layout preserves opaque styles without interpreting engine markup", () => {
    const shaper = Shaper.open(FONT_PATH);
    const input = plainSource("مرحبا بالعالم");
    const firstLine = input[0];
    if (firstLine) {
      for (const ch of firstLine.chars) {
        (ch as { styles: readonly number[] }).styles = [72, 91];
      }
    }

    const allocator = new PuaAllocator(shaper.cmap(), []);
    const fitted = fitText(input, { width: 1000, size: 36, height: 0 }, shaper, allocator, 2048);
    expect(fitted.lines).toBe(1);
    for (const span of fitted.spans) {
      expect(span.styles).toEqual([72, 91]);
    }

    const literal = plainSource("{color=red} [name]");
    expect(literal[0]?.chars[0]?.codepoint).toBe("{".charCodeAt(0));
  });

  it("shared layout splits oversized Arabic glyphs without changing the outline", () => {
    const shaper = Shaper.open(FONT_PATH);
    let text = "";
    for (let i = 0; i < 200; i += 1) {
      text += "س";
    }

    const run: Run = { text, styles: [], direction: "rtl" };
    expect(fitsGlyph(shaper, run)).toBe(false);

    const allocator = new PuaAllocator(shaper.cmap(), []);
    const spans = encodeRun(run, allocator, shaper);
    expect(spans.length).toBeGreaterThan(1);

    let combined: GlyphOutline = {
      commands: [],
      bounds: { xMin: 0, yMin: 0, xMax: 0, yMax: 0, empty: true },
    };
    let offset = 0;

    for (const span of spans) {
      const cp = decodeUtf8(span.text)[0];
      const mapping = allocator.mappings().find((m) => m.codepoint === cp);
      expect(mapping).toBeDefined();
      if (!mapping) continue;

      const shape = shaper.shape(mapping.token, mapping.direction);
      const translated = translatedOutline(composeOutline(shaper, shape), offset, 0);
      combined = appendOutline(combined, translated);
      offset += shape.advance();
    }

    const whole = shaper.shape(text, "rtl");
    expect(offset).toBe(whole.advance());
    expect(commandsEqual(combined.commands, composeOutline(shaper, whole).commands)).toBe(true);
  });
});
