import { describe, expect, it } from "bun:test";
import { LayoutEngine } from "./engine.ts";
import { Shaper } from "./font/shaper.ts";
import { measureText } from "./layout/measure.ts";
import { plainSource } from "./layout/source.ts";
import { wrapLines } from "./layout/wrap.ts";
import { MissingGlyphError, LayoutOverflowError } from "./errors.ts";
import { splitGraphemes, graphemeCount } from "./unicode/graphemes.ts";

const FONT_PATH = "assets/fonts/force.ttf";

describe("Comprehensive Edge Cases & Conformance", () => {
  it("shapes mixed Arabic with URLs, English, and numbers in correct visual order", () => {
    const { engine } = LayoutEngine.fromFont(FONT_PATH);
    const text = "قم بزيارة https://example.com/api للحصول على الإصدار 3.5.0 فورا";
    const result = engine.layout(text, { width: 600, fontSize: 20 });

    expect(result.lines.length).toBeGreaterThan(0);
    // URL must be preserved as an LTR run without reversing internal characters
    const lineWithUrl = result.lines.find((l) => l.text.includes("https://example.com/api"));
    expect(lineWithUrl).toBeDefined();
    const urlRun = lineWithUrl?.runs.find((r) => r.text.includes("example.com"));
    expect(urlRun?.direction).toBe("ltr");
  });

  it("handles emoji, astral Unicode codepoints, and grapheme clusters", () => {
    // Character with multiple codepoints / combining marks
    const text = "مرحبا 🎮✨ بالعالم 🚀";
    expect(graphemeCount(text)).toBe(18);
    const segments = splitGraphemes(text);
    expect(segments).toContain("🎮");
    expect(segments).toContain("✨");
    expect(segments).toContain("🚀");

    const { engine } = LayoutEngine.fromFont(FONT_PATH);
    // force.ttf does not contain emoji glyphs: engine reports MissingGlyphError rather than silently dropping
    expect(() => engine.layout("مرحبا بالعالم 🎮", { width: 400, fontSize: 24 })).toThrow(
      MissingGlyphError,
    );
  });

  it("demonstrates shaping differences caused by line boundary splitting", () => {
    const shaper = Shaper.open(FONT_PATH);

    // In Arabic, "يد" has initial Yeh (0x064a) and final Dal (0x062f).
    const connected = shaper.shape("يد", "rtl");
    // Initial Yeh has glyphId 372 in Force font
    expect(connected.glyphs.length).toBe(2);
    const yehInitial = connected.glyphs[1]?.glyphId;

    // If separated across a boundary, isolated Yeh has glyphId 324
    const isolatedYeh = shaper.shape("ي", "rtl");
    expect(isolatedYeh.glyphs[0]?.glyphId).toBe(324);
    expect(yehInitial).not.toBe(isolatedYeh.glyphs[0]?.glyphId);
  });

  it("reports MissingGlyphError when font cannot resolve a required character", () => {
    const shaper = Shaper.open(FONT_PATH);
    // Devanagari character U+0905 is not present in force.ttf
    expect(() => measureText(shaper, "अ")).toThrow(MissingGlyphError);
  });

  it("handles exact-width boundary conditions", () => {
    const shaper = Shaper.open(FONT_PATH);
    const text = "كلمة";
    const exactAdvance = shaper.shape(text, "rtl").advance();

    // Wrapping with exactly exactAdvance succeeds
    const paragraphs = plainSource(text);
    const wrappedExact = wrapLines(shaper, paragraphs, exactAdvance);
    expect(wrappedExact.length).toBe(1);

    // Wrapping with exactAdvance - 1 unit throws LayoutOverflow
    expect(() => wrapLines(shaper, paragraphs, exactAdvance - 1)).toThrow(LayoutOverflowError);
  });

  it("handles repeated placeholders and paired markup tags without corruption", () => {
    const { engine } = LayoutEngine.fromFont(FONT_PATH);
    const text = "{b}%s{/b} و %s و {color=#ff0000}[player]{/color}";
    const result = engine.layout(text, {
      width: 450,
      fontSize: 22,
      placeholderPolicy: { mode: "sample-text", sample: "100" },
    });

    expect(result.lines.length).toBeGreaterThan(0);
    // Text should contain sample substitution and render correctly
    expect(result.lines[0]?.glyphs.length).toBeGreaterThan(0);
  });
});
