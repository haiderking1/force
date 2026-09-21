import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { Shaper } from "./shaper.ts";
import { fontLineUnits, parseSfntDirectory } from "./metrics.ts";
import { composeOutline } from "./outline.ts";
import { FontError, RenderingError } from "../errors.ts";

const FONT_PATH = "assets/fonts/force.ttf";

describe("Shaper and Font Metrics", () => {
  const fontBytes = new Uint8Array(readFileSync(FONT_PATH));

  it("parses SFNT directory and hhea line metrics", () => {
    const tables = parseSfntDirectory(fontBytes);
    expect(tables.has("head")).toBe(true);
    expect(tables.has("hhea")).toBe(true);
    expect(tables.has("CFF ")).toBe(true);

    const lineUnits = fontLineUnits(fontBytes);
    expect(lineUnits).toBe(3063);
  });

  it("opens font and loads face properties", () => {
    const shaper = Shaper.open(FONT_PATH);
    expect(shaper.family()).toBe("Force");
    expect(shaper.unitsPerEm()).toBe(2048);
    expect(shaper.glyphCount()).toBeGreaterThan(300);
  });

  it("shapes Arabic text and matches exact advance and glyph metrics", () => {
    const shaper = Shaper.open(FONT_PATH);
    const shaped = shaper.shape("الإصدار", "rtl");

    expect(shaped.advance()).toBe(5056);
    expect(shaped.signedAdvance).toBe(5056);
    expect(shaped.glyphs.length).toBe(6);

    const glyphIds = shaped.glyphs.map((g) => g.glyphId);
    expect(glyphIds).toEqual([256, 224, 253, 270, 332, 224]);
  });

  it("forms Lam-Alef ligatures properly", () => {
    const shaper = Shaper.open(FONT_PATH);
    const shaped = shaper.shape("لا", "rtl");
    // "لا" is 2 Unicode codepoints (Lam + Alef), should form 1 ligature glyph
    expect(shaped.glyphs.length).toBe(1);
    expect(shaped.glyphs[0]?.glyphId).toBe(334);
  });

  it("shapes Tashkeel combining marks with zero horizontal advance", () => {
    const shaper = Shaper.open(FONT_PATH);
    // Beh with Fatha: "بَ"
    const shaped = shaper.shape("بَ", "rtl");
    expect(shaped.glyphs.length).toBe(2);
    // The Fatha mark should have zero xAdvance
    const fatha = shaped.glyphs.find((g) => g.xAdvance === 0);
    expect(fatha).toBeDefined();
    expect(fatha?.xAdvance).toBe(0);
    expect(fatha?.glyphId).toBe(170);
  });

  it("handles Tatweel, ZWJ, and ZWNJ correctly", () => {
    const shaper = Shaper.open(FONT_PATH);

    // Tatweel stretches word between connected letters
    const normal = shaper.shape("بب", "rtl");
    const withTatweel = shaper.shape("بـب", "rtl");
    expect(withTatweel.advance()).toBeGreaterThan(normal.advance());

    // ZWNJ prevents ligature
    const withoutZwnj = shaper.shape("لا", "rtl");
    const withZwnj = shaper.shape("ل\u200cا", "rtl");
    expect(withZwnj.glyphs.length).toBeGreaterThan(withoutZwnj.glyphs.length);
  });

  it("shapes Arabic-Indic and Western digits", () => {
    const shaper = Shaper.open(FONT_PATH);
    const western = shaper.shape("123", "ltr");
    const arabicIndic = shaper.shape("١٢٣", "rtl");

    expect(western.glyphs.length).toBe(3);
    expect(arabicIndic.glyphs.length).toBe(3);
    expect(western.advance()).toBeGreaterThan(0);
    expect(arabicIndic.advance()).toBeGreaterThan(0);
  });

  it("decomposes glyph outlines matching Ara exact integer coordinates", () => {
    const shaper = Shaper.open(FONT_PATH);
    const out = shaper.outline(224);

    expect(out.commands.length).toBe(8);
    expect(out.commands[out.commands.length - 1]?.op).toBe("close");
    expect(out.bounds).toEqual({
      xMin: 130,
      yMin: 0,
      xMax: 351,
      yMax: 1488,
      empty: false,
    });
  });

  it("composes token outline matching Ara exact bounds", () => {
    const shaper = Shaper.open(FONT_PATH);
    const shaped = shaper.shape("الإصدار", "rtl");
    const composed = composeOutline(shaper, shaped);

    expect(composed.commands.length).toBe(128);
    expect(composed.commands.filter((cmd) => cmd.op === "close").length).toBe(9);
    expect(composed.bounds).toEqual({
      xMin: -150,
      yMin: -416,
      xMax: 4956,
      yMax: 1490,
      empty: false,
    });
  });

  it("handles lifecycle cleanup and prevents use after destroy", () => {
    const shaper = Shaper.open(FONT_PATH);
    expect(shaper.unitsPerEm()).toBe(2048);
    shaper.destroy();
    expect(() => shaper.unitsPerEm()).toThrow(FontError);
    expect(() => shaper.shape("test", "ltr")).toThrow(FontError);
  });
});
