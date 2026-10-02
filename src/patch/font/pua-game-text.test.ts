import { expect, test } from "bun:test";
import { LayoutEngine } from "../../rendering/engine.ts";
import { ARABIC_GHAIN, PERSIAN_GAF } from "./persian-gaf.ts";
import { GameTextPlanner, planPuaGameText } from "./pua-game-text.ts";
import { FONT3_EM } from "./scale.ts";

const profile = { width: 180, height: 300, fontSize: 24 };

test("game text wraps before visual encoding and keeps measured line widths", () => {
  const { engine, shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
  try {
    const plan = planPuaGameText(
      engine,
      [{ id: "line", text: "مرحبًا يا إيدي، كيف حالك اليوم؟ هذا سطر طويل يحتاج إلى تقسيم.", profile }],
      0xe100,
    );
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
      expect(width).toBeLessThanOrEqual(profile.width + 0.5);
      expect(Math.abs(width - (label.widths[index] ?? -100))).toBeLessThan(0.1);
    }
  } finally {
    shaper.destroy();
  }
});

test("operative tokens stay ASCII and Persian gaf becomes ghain before shaping", () => {
  const { engine, shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
  try {
    const plan = planPuaGameText(
      engine,
      [
        { id: "bleep", text: `هذا /bleep/ اختبار`, profile },
        { id: "printf", text: "لديك %s قطعة", profile },
        { id: "gaf", text: `أورما${PERSIAN_GAF}ودن`, profile },
      ],
      0xe180,
    );
    const bleep = plan.labels.find((row) => row.id === "bleep");
    const printf = plan.labels.find((row) => row.id === "printf");
    const gaf = plan.labels.find((row) => row.id === "gaf");
    if (!bleep || !printf || !gaf) throw new Error("missing labels");
    expect(bleep.encoded.includes("/bleep/")).toBe(true);
    expect(bleep.tokens).toEqual(["/bleep/"]);
    expect(printf.encoded.includes("%s")).toBe(true);
    expect(printf.tokens).toEqual(["%s"]);
    expect(gaf.logical.includes(PERSIAN_GAF)).toBe(false);
    expect(gaf.logical.includes(ARABIC_GHAIN)).toBe(true);
    expect(gaf.encoded.includes(PERSIAN_GAF)).toBe(false);
    expect(gaf.gafCount).toBe(1);
    expect(plan.gafSubstitutions).toEqual([
      { id: "gaf", key: "persian-gaf", from: PERSIAN_GAF, to: ARABIC_GHAIN, count: 1 },
    ]);
    const reused = planPuaGameText(
      engine,
      [{ id: "a", text: "مرحبا", profile }, { id: "b", text: "مرحبا", profile }],
      0xe200,
    );
    expect(reused.labels[0]?.encoded).toBe(reused.labels[1]?.encoded);
    expect(reused.glyphs.length).toBeLessThan(
      (reused.labels[0]?.encoded.length ?? 0) + (reused.labels[1]?.encoded.length ?? 0),
    );
  } finally {
    shaper.destroy();
  }
});

test("planner retries a taller fallback and rejects empty or colliding ids", () => {
  const { engine, shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
  try {
    const planner = new GameTextPlanner(engine, 0xe280);
    const overflowed = planner.encode(
      {
        id: "tall",
        text: "هذا سطر طويل جدا يحتاج إلى أكثر من صندوق قصير للغاية حتى ينزل على عدة أسطر.",
        profile: { width: 160, height: 20, fontSize: 24 },
      },
      { width: 160, height: 400, fontSize: 24 },
    );
    expect(overflowed.boxFit).toBe(false);
    expect(overflowed.layout.lines.length).toBeGreaterThan(1);
    expect(() => planPuaGameText(engine, [{ id: "a", text: "" , profile }], 0xe300)).toThrow();
    expect(() =>
      planPuaGameText(engine, [{ id: "a", text: "مرحبا", profile }, { id: "a", text: "مرحبا", profile }], 0xe300),
    ).toThrow();
    expect(() => planPuaGameText(engine, [{ id: "a", text: "مرحبا", profile }], 0xdfff)).toThrow();
  } finally {
    shaper.destroy();
  }
});
