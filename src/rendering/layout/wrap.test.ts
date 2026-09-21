import { describe, expect, it } from "bun:test";
import { Shaper } from "../font/shaper.ts";
import { wrapLogicalTokens, wrapLines } from "./wrap.ts";
import { plainSource } from "./source.ts";
import { measureLineAdvance } from "./measure.ts";
import { prepareGameLines } from "../syntax/tokens.ts";
import { LayoutOverflowError, RenderingError } from "../errors.ts";

const FONT_PATH = "assets/fonts/force.ttf";

describe("Wrapping and Fitting", () => {
  it("rejects a directional run wider than the source width", () => {
    const shaper = Shaper.open(FONT_PATH);
    const narrow = shaper.shape("i", "ltr").advance();
    expect(() => wrapLogicalTokens(shaper, ["الإصدار"], narrow)).toThrow(LayoutOverflowError);
  });

  it("wraps logical tokens into lines fitting the available width", () => {
    const shaper = Shaper.open(FONT_PATH);
    const tokens = ["الإصدار", "2.0", "الآن", "مع", "دعم", "كامل"];
    const lines = wrapLogicalTokens(shaper, tokens, 8000);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it("rejects invalid non-positive width", () => {
    const shaper = Shaper.open(FONT_PATH);
    expect(() => wrapLogicalTokens(shaper, ["مرحبا"], 0)).toThrow(RenderingError);
    expect(() => wrapLogicalTokens(shaper, ["مرحبا"], -10)).toThrow(RenderingError);
  });

  it("wraps styled paragraph lines preserving line boundaries", () => {
    const shaper = Shaper.open(FONT_PATH);
    const paragraphs = plainSource("هذا نص تجريبي طويل جدا لغرض اختبار التفاف الأسطر.\nسطر ثان هنا.\n");
    const wrapped = wrapLines(shaper, paragraphs, 15000);
    expect(wrapped.length).toBeGreaterThan(2);
  });

  it("rejects whitespace-only line exceeding width", () => {
    const shaper = Shaper.open(FONT_PATH);
    const paragraphs = plainSource("      "); // spaces
    expect(() => wrapLines(shaper, paragraphs, 10)).toThrow(LayoutOverflowError);
  });

  it("wraps reserved placeholder slots by their reserved advance, not a stand-in glyph", () => {
    const shaper = Shaper.open(FONT_PATH);
    const zeroWidth = shaper.shape("0", "ltr").advance();
    expect(zeroWidth).toBeGreaterThan(20);

    const ten = prepareGameLines("%i", {
      placeholderPolicy: { mode: "fixed-width", width: 10 },
    });
    const wrappedTen = wrapLines(shaper, ten.paragraphs, 20, "ltr");
    expect(wrappedTen.length).toBe(1);
    expect(wrappedTen[0]?.chars[0]?.reservedAdvance).toBe(10);

    const fat = prepareGameLines("%i", {
      placeholderPolicy: { mode: "fixed-width", width: 300 },
    });
    expect(() => wrapLines(shaper, fat.paragraphs, 20, "ltr")).toThrow(LayoutOverflowError);

    const adjacentTen = prepareGameLines("X%iY", {
      placeholderPolicy: { mode: "fixed-width", width: 10 },
    });
    const adjacentFat = prepareGameLines("X%iY", {
      placeholderPolicy: { mode: "fixed-width", width: 300 },
    });
    const tenChars = adjacentTen.paragraphs[0]?.chars ?? [];
    const fatChars = adjacentFat.paragraphs[0]?.chars ?? [];
    expect(measureLineAdvance(shaper, fatChars, "ltr") - measureLineAdvance(shaper, tenChars, "ltr")).toBe(
      290,
    );

    const mid = measureLineAdvance(shaper, tenChars, "ltr") + 50;
    const wrappedAdjacentTen = wrapLines(shaper, adjacentTen.paragraphs, mid, "ltr");
    expect(wrappedAdjacentTen.length).toBe(1);
    expect(wrappedAdjacentTen[0]?.chars.some((ch) => ch.reservedAdvance === 10)).toBe(true);

    const wrappedAdjacentFat = wrapLines(shaper, adjacentFat.paragraphs, mid, "ltr");
    expect(wrappedAdjacentFat.length).toBeGreaterThan(1);
    const fatCharsAfterWrap = wrappedAdjacentFat.flatMap((line) => [...line.chars]);
    expect(fatCharsAfterWrap.length).toBe(3);
    expect(fatCharsAfterWrap.some((ch) => ch.reservedAdvance === 300)).toBe(true);
    expect(fatCharsAfterWrap.map((ch) => ch.codepoint)).toEqual([
      0x58,
      0xfffc,
      0x59,
    ]);
  });

  it("splits Windows newlines in plain source into separate lines", () => {
    const shaper = Shaper.open(FONT_PATH);
    const paragraphs = plainSource("A\r\nB");
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0]?.chars.map((ch) => ch.codepoint)).toEqual([0x41]);
    expect(paragraphs[0]?.newline).toBe(true);
    expect(paragraphs[1]?.chars.map((ch) => ch.codepoint)).toEqual([0x42]);

    const wrapped = wrapLines(shaper, paragraphs, 10000, "ltr");
    expect(wrapped.length).toBe(2);
  });
});
