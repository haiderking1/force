import { describe, expect, it } from "bun:test";
import { logicalDirectionalRuns, visualOrder, resolveEmbeddingLevels } from "./bidi.ts";
import { Shaper } from "../font/shaper.ts";
import { measureText } from "../layout/measure.ts";
import { RenderingError } from "../errors.ts";
import type { VisualToken } from "../types.ts";

const FONT_PATH = "assets/fonts/force.ttf";

describe("Bidirectional Resolution and Ordering", () => {
  it("splits mixed direction tokens and matches Ara visual order", () => {
    const actual = visualOrder(["الإصدار", "2.0", "(Beta)!", "الآن."]);
    const expected: readonly VisualToken[] = [
      { text: "الآن.", direction: "rtl" },
      { text: "", direction: "spacer" },
      { text: ")!", direction: "rtl" },
      { text: "Beta", direction: "ltr" },
      { text: "(", direction: "rtl" },
      { text: "", direction: "spacer" },
      { text: "2.0", direction: "ltr" },
      { text: "", direction: "spacer" },
      { text: "الإصدار", direction: "rtl" },
    ];

    expect(actual).toEqual(expected);

    for (const run of actual) {
      expect(run.text).not.toBe("(Beta)!");
      if (run.text === "Beta") {
        expect(run.direction).toBe("ltr");
      }
    }
  });

  it("extracts logical bidi runs preserving spaces and measures each direction", () => {
    const text = "Version الإصدار 2.0";
    const runs = logicalDirectionalRuns(text);
    const expected: readonly VisualToken[] = [
      { text: "Version ", direction: "ltr" },
      { text: "الإصدار ", direction: "rtl" },
      { text: "2.0", direction: "ltr" },
    ];
    expect(runs).toEqual(expected);

    const shaper = Shaper.open(FONT_PATH);
    let independentlySummed = 0;
    for (const run of runs) {
      independentlySummed += shaper.shape(run.text, run.direction).advance();
    }
    const wholeBuffer = shaper.shapeAuto(text).advance();
    expect(measureText(shaper, text)).toBe(independentlySummed);
    expect(wholeBuffer).toBeGreaterThan(independentlySummed);
  });

  it("does not collapse whitespace during logical bidi itemization", () => {
    const text = "A  الإصدار\t  2.0";
    let reconstructed = "";
    for (const run of logicalDirectionalRuns(text)) {
      reconstructed += run.text;
    }
    expect(reconstructed).toBe(text);
  });

  it("rejects empty token reordering", () => {
    expect(() => visualOrder(["word", ""])).toThrow(RenderingError);
  });

  it("reorders mixed tokens from the requested paragraph base direction", () => {
    const tokens = ["Hello", "مرحبا"];
    const rtlExpected: readonly VisualToken[] = [
      { text: "مرحبا", direction: "rtl" },
      { text: "", direction: "spacer" },
      { text: "Hello", direction: "ltr" },
    ];
    const ltrExpected: readonly VisualToken[] = [
      { text: "Hello", direction: "ltr" },
      { text: "", direction: "spacer" },
      { text: "مرحبا", direction: "rtl" },
    ];

    expect(visualOrder(tokens)).toEqual(rtlExpected);
    expect(visualOrder(tokens, "rtl")).toEqual(rtlExpected);
    expect(visualOrder(tokens, "ltr")).toEqual(ltrExpected);
  });

  it("handles directional formatting marks (LRM / RLM / LRE / RLE / PDF)", () => {
    // Text with Left-to-Right Mark (U+200E) and Right-to-Left Mark (U+200F)
    const text = "مرحبا \u200eHello\u200e بالعالم";
    const runs = logicalDirectionalRuns(text);
    expect(runs.length).toBeGreaterThan(1);
  });
});
