import { expect, test } from "bun:test";
import { Shaper } from "../../rendering/font/shaper.ts";
import { parseFontShape } from "../gfx/shape.ts";
import { planPuaLabels } from "./pua-labels.ts";
import { SI16_MAX } from "./scale.ts";

const FONT_PATH = "assets/fonts/force.ttf";

test("short Arabic labels become one composed PUA glyph inside SI16", () => {
  const shaper = Shaper.open(FONT_PATH);
  const plan = planPuaLabels(shaper, [{ id: "TCRR004TEXT", text: "لا" }]);
  shaper.destroy();
  const label = plan.labels[0];
  expect(label?.units.length).toBe(1);
  expect(label?.units[0]?.composed).toBe(true);
  expect(label?.units[0]?.advance).toBeLessThanOrEqual(SI16_MAX);
  expect(label?.encoded.length).toBe(1);
  expect(label?.encoded.codePointAt(0)).toBe(0xe000);
  const glyph = plan.glyphs[0];
  if (glyph === undefined) {
    throw new Error("missing glyph");
  }
  const shape = parseFontShape(glyph.shapeBytes, 0, glyph.shapeBytes.length);
  expect(shape.records.some((record) => record.kind === "curve" || record.kind === "line")).toBe(true);
});

test("wide Arabic labels split into per-glyph PUA units instead of overflowing SI16", () => {
  const shaper = Shaper.open(FONT_PATH);
  const plan = planPuaLabels(shaper, [{ id: "TMPP159TEXT", text: "هل أنت متأكد؟" }]);
  shaper.destroy();
  const label = plan.labels[0];
  expect(label?.units.length).toBeGreaterThan(1);
  expect(label?.units.every((unit) => unit.advance <= SI16_MAX)).toBe(true);
  expect(label?.encoded.length).toBe(label?.units.length);
});
