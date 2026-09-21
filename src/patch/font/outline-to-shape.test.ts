import { expect, test } from "bun:test";
import type { GlyphOutline } from "../../rendering/types.ts";
import { parseFontShape } from "../gfx/shape.ts";
import { outlineToFont3Shape } from "./outline-to-shape.ts";
import { font3ScaleFromUpem } from "./scale.ts";

test("TrueType quadratic outlines keep their control points after Font3 scale and Y flip", () => {
  const outline: GlyphOutline = {
    commands: [
      { op: "move", a: { x: 0, y: 0 } },
      { op: "quad", a: { x: 50, y: 100 }, b: { x: 100, y: 0 } },
      { op: "close", a: { x: 0, y: 0 } },
    ],
    bounds: { xMin: 0, yMin: 0, xMax: 100, yMax: 100, empty: false },
  };
  const scale = font3ScaleFromUpem(2048);
  expect(scale).toBe(10);
  const shaped = outlineToFont3Shape(outline, scale);
  const parsed = parseFontShape(shaped.shapeBytes, 0, shaped.shapeBytes.length);
  expect(parsed.records[0]).toEqual({ kind: "move", x: 0, y: 0, fillStyle0: 1 });
  expect(parsed.records[1]).toEqual({ kind: "curve", controlX: 500, controlY: -1000, x: 1000, y: 0 });
});

test("close emits a line back to the contour start", () => {
  const outline: GlyphOutline = {
    commands: [
      { op: "move", a: { x: 2, y: 4 } },
      { op: "line", a: { x: 8, y: 4 } },
      { op: "line", a: { x: 8, y: 10 } },
      { op: "close", a: { x: 2, y: 4 } },
    ],
    bounds: { xMin: 2, yMin: 4, xMax: 8, yMax: 10, empty: false },
  };
  const shaped = outlineToFont3Shape(outline, 10);
  const parsed = parseFontShape(shaped.shapeBytes, 0, shaped.shapeBytes.length);
  const last = parsed.records[parsed.records.length - 1];
  expect(last).toEqual({ kind: "line", x: 20, y: -40 });
});
