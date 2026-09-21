import { describe, expect, it } from "bun:test";
import { LayoutEngine } from "./engine.ts";
import { generateHtmlPreview, generateSvgPreview } from "./preview/svg.ts";

const FONT_PATH = "assets/fonts/force.ttf";

describe("LayoutEngine and Visual Previews", () => {
  it("renders logical Arabic text with full layout metadata", () => {
    const { engine, shaper } = LayoutEngine.fromFont(FONT_PATH);
    const result = engine.layout("مرحبا بالعالم! هذا اختبار لتخطيط النص العربي.", {
      width: 350,
      fontSize: 24,
      alignment: "right",
    });

    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.fontSize).toBe(24);
    expect(result.unitsPerEm).toBe(2048);
    expect(result.scale).toBeCloseTo(24 / 2048);

    for (const line of result.lines) {
      expect(line.glyphs.length).toBeGreaterThan(0);
      expect(line.width).toBeLessThanOrEqual(result.totalWidth);
      expect(line.runs.length).toBeGreaterThan(0);
    }

    const svg = generateSvgPreview(result, shaper, { showLineBoxes: true, showBaselines: true });
    expect(svg.startsWith("<?xml")).toBe(true);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    expect(svg).toContain("</svg>");
  });

  it("produces HTML preview with inspection data", () => {
    const { engine, shaper } = LayoutEngine.fromFont(FONT_PATH);
    const result = engine.layout("الإصدار 2.0 تجريبي", {
      width: 300,
      fontSize: 20,
    });

    const html = generateHtmlPreview(result, shaper);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Layout Inspection Data");
    expect(html).toContain("<svg");
  });

  it("supports left, right, and center alignments", () => {
    const { engine } = LayoutEngine.fromFont(FONT_PATH);
    const text = "سطر قصير";

    const left = engine.layout(text, { width: 500, fontSize: 24, alignment: "left" });
    const right = engine.layout(text, { width: 500, fontSize: 24, alignment: "right" });
    const center = engine.layout(text, { width: 500, fontSize: 24, alignment: "center" });

    const leftX = left.lines[0]?.glyphs[0]?.x ?? 0;
    const rightX = right.lines[0]?.glyphs[0]?.x ?? 0;
    const centerX = center.lines[0]?.glyphs[0]?.x ?? 0;

    expect(rightX).toBeGreaterThan(centerX);
    expect(centerX).toBeGreaterThan(leftX);
  });

  it("passes baseDirection into bidi resolution independently of alignment", () => {
    const { engine } = LayoutEngine.fromFont(FONT_PATH);
    const text = "Hello مرحبا";
    const options = { width: 800, fontSize: 24, alignment: "left" as const };

    const omitted = engine.layout(text, options);
    const rtl = engine.layout(text, { ...options, baseDirection: "rtl" });
    const ltr = engine.layout(text, { ...options, baseDirection: "ltr" });

    expect(omitted.baseDirection).toBe("rtl");
    expect(rtl.baseDirection).toBe("rtl");
    expect(ltr.baseDirection).toBe("ltr");

    const omittedRuns = omitted.lines[0]?.runs.map((run) => run.text) ?? [];
    const rtlRuns = rtl.lines[0]?.runs.map((run) => run.text) ?? [];
    const ltrRuns = ltr.lines[0]?.runs.map((run) => run.text) ?? [];

    expect(omittedRuns).toEqual(rtlRuns);
    expect(rtlRuns[0]).toContain("مرحبا");
    expect(ltrRuns[0]).toContain("Hello");
    expect(rtlRuns).not.toEqual(ltrRuns);

    const rtlLeft = rtl.lines[0]?.glyphs[0]?.x ?? -1;
    const ltrLeft = ltr.lines[0]?.glyphs[0]?.x ?? -1;
    expect(rtlLeft).toBe(0);
    expect(ltrLeft).toBe(0);
  });

  it("measures fixed placeholder widths in font units, not as one space", () => {
    const { engine } = LayoutEngine.fromFont(FONT_PATH);
    const options = {
      width: 800,
      fontSize: 24,
      alignment: "left" as const,
      baseDirection: "ltr" as const,
    };

    const ten = engine.layout("X%iY", {
      ...options,
      placeholderPolicy: { mode: "fixed-width", width: 10 },
    });
    const fat = engine.layout("X%iY", {
      ...options,
      placeholderPolicy: { mode: "fixed-width", width: 300 },
    });

    expect(ten.lines[0]?.runs.some((run) => run.reservedAdvance === 10)).toBe(true);
    expect(fat.lines[0]?.runs.some((run) => run.reservedAdvance === 300)).toBe(true);
    expect((fat.lines[0]?.width ?? 0) - (ten.lines[0]?.width ?? 0)).toBeCloseTo(290 * (24 / 2048));
  });

  it("lays out Windows CRLF as a line break", () => {
    const { engine } = LayoutEngine.fromFont(FONT_PATH);
    const result = engine.layout("A\r\nB", {
      width: 400,
      fontSize: 24,
      alignment: "left",
      baseDirection: "ltr",
    });
    expect(result.lines.length).toBe(2);
    expect(result.lines[0]?.text).toContain("A");
    expect(result.lines[1]?.text).toContain("B");
  });

  it("does not measure %i as literal text when no placeholder policy is set", () => {
    const { engine } = LayoutEngine.fromFont(FONT_PATH);
    const options = {
      width: 800,
      fontSize: 24,
      alignment: "left" as const,
      baseDirection: "ltr" as const,
    };

    const missing = engine.layout("Score: %i!", options);
    const omitted = engine.layout("Score: !", options);
    const asText = engine.layout("Score: %i!", {
      ...options,
      placeholderPolicy: { mode: "sample-text", sample: "%i" },
    });

    expect(missing.diagnostics.some((d) => d.code === "UNRESOLVED_DYNAMIC_PLACEHOLDER")).toBe(true);
    expect(missing.lines[0]?.width).toBeCloseTo(omitted.lines[0]?.width ?? -1);
    expect(asText.lines[0]?.width ?? 0).toBeGreaterThan(missing.lines[0]?.width ?? 0);
  });
});
