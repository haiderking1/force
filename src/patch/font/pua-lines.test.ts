import { expect, test } from "bun:test";
import { LayoutEngine } from "../../rendering/engine.ts";
import { planPuaLines } from "./pua-lines.ts";
import { FONT3_EM } from "./scale.ts";

const profile = { width: 180, height: 300, fontSize: 24 };

test("subtitles wrap before visual encoding and preserve each measured line", () => {
  const { engine, shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
  try {
    const plan = planPuaLines(engine, [{ id: "line", text: "مرحبًا يا إيدي، كيف حالك اليوم؟ هذا سطر طويل يحتاج إلى تقسيم." }], profile, 0xe100);
    const label = plan.labels[0];
    if (!label) throw new Error("missing label");
    expect(label.layout.lines.length).toBeGreaterThan(1);
    const encoded = label.encoded.split("\n");
    expect(encoded.length).toBe(label.layout.lines.length);
    const map = new Map(plan.glyphs.map((glyph) => [glyph.code, glyph]));
    for (const [index, line] of encoded.entries()) {
      let advance = 0;
      for (const char of line) {
        const glyph = map.get(char.codePointAt(0) ?? -1);
        if (!glyph) throw new Error("missing encoded glyph");
        expect(glyph.code).toBeGreaterThanOrEqual(0xe100);
        advance += glyph.advance;
      }
      const width = advance / FONT3_EM * profile.fontSize;
      expect(width).toBeLessThanOrEqual(profile.width);
      expect(Math.abs(width - (label.layout.lines[index]?.width ?? -100))).toBeLessThan(0.1);
    }
  } finally { shaper.destroy(); }
});

test("subtitles retain hard breaks, mixed numbers and reusable glyph codes", () => {
  const { engine, shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
  try {
    const text = "هذا عام 1970\nمرحبًا";
    const plan = planPuaLines(engine, [{ id: "a", text }, { id: "b", text }], profile, 0xe100);
    expect(plan.labels[0]?.encoded).toBe(plan.labels[1]?.encoded);
    expect(plan.labels[0]?.encoded.split("\n").length).toBe(2);
  } finally { shaper.destroy(); }
});

test("subtitles reject overflow, PUA collisions, unsupported controls and duplicate ids", () => {
  const { engine, shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
  try {
    const request = [{ id: "a", text: "مرحبًا" }];
    expect(() => planPuaLines(engine, request, profile, 0xdfff)).toThrow();
    expect(() => planPuaLines(engine, request, profile, 0xf8ff)).toThrow();
    expect(() => planPuaLines(engine, request, { ...profile, height: 1 }, 0xe100)).toThrow();
    expect(() => planPuaLines(engine, [...request, ...request], profile, 0xe100)).toThrow();
    for (const text of ["/bleep/مرحبا/bleep/", "مرحبا %s", "{color=red}مرحبا{/color}", ""]) {
      expect(() => planPuaLines(engine, [{ id: "a", text }], profile, 0xe100)).toThrow();
    }
  } finally { shaper.destroy(); }
});
