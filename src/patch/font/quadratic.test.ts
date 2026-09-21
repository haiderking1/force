import { expect, test } from "bun:test";
import {
  CUBIC_TO_QUAD_MAX_ERROR,
  cubicPoint,
  cubicQuadError,
  cubicToQuadratics,
  cubicToSingleQuad,
  type CubicSegment,
} from "./quadratic.ts";

test("degree-elevated quadratic converts to one quad under the error bound", () => {
  const q0 = { x: 0, y: 0 };
  const q1 = { x: 100, y: 80 };
  const q2 = { x: 200, y: 0 };
  const cubic: CubicSegment = {
    p0: q0,
    p1: { x: (q0.x + 2 * q1.x) / 3, y: (q0.y + 2 * q1.y) / 3 },
    p2: { x: (2 * q1.x + q2.x) / 3, y: (2 * q1.y + q2.y) / 3 },
    p3: q2,
  };
  const quad = cubicToSingleQuad(cubic);
  expect(cubicQuadError(cubic, quad)).toBeLessThanOrEqual(1e-9);
  const parts = cubicToQuadratics(cubic, CUBIC_TO_QUAD_MAX_ERROR);
  expect(parts.length).toBe(1);
  const only = parts[0];
  if (only === undefined) {
    throw new Error("missing quad");
  }
  expect(only.p1.x).toBeCloseTo(100, 8);
  expect(only.p1.y).toBeCloseTo(80, 8);
});

test("high-curvature cubic stays within the explicit Font3-unit error bound", () => {
  const cubic: CubicSegment = {
    p0: { x: 0, y: 0 },
    p1: { x: 0, y: 400 },
    p2: { x: 400, y: 400 },
    p3: { x: 400, y: 0 },
  };
  const parts = cubicToQuadratics(cubic, CUBIC_TO_QUAD_MAX_ERROR);
  expect(parts.length).toBeGreaterThan(1);
  for (const part of parts) {
    const reconstructed: CubicSegment = {
      p0: part.p0,
      p1: {
        x: (part.p0.x + 2 * part.p1.x) / 3,
        y: (part.p0.y + 2 * part.p1.y) / 3,
      },
      p2: {
        x: (2 * part.p1.x + part.p2.x) / 3,
        y: (2 * part.p1.y + part.p2.y) / 3,
      },
      p3: part.p2,
    };
    expect(cubicQuadError(reconstructed, part)).toBeLessThanOrEqual(CUBIC_TO_QUAD_MAX_ERROR);
  }
  for (let index = 0; index <= 32; index += 1) {
    const t = index / 32;
    const exact = cubicPoint(cubic, t);
    let nearest = Infinity;
    for (const part of parts) {
      for (let sample = 0; sample <= 16; sample += 1) {
        const q = {
          x: (1 - sample / 16) ** 2 * part.p0.x + 2 * (1 - sample / 16) * (sample / 16) * part.p1.x + (sample / 16) ** 2 * part.p2.x,
          y: (1 - sample / 16) ** 2 * part.p0.y + 2 * (1 - sample / 16) * (sample / 16) * part.p1.y + (sample / 16) ** 2 * part.p2.y,
        };
        nearest = Math.min(nearest, Math.hypot(exact.x - q.x, exact.y - q.y));
      }
    }
    expect(nearest).toBeLessThanOrEqual(CUBIC_TO_QUAD_MAX_ERROR + 0.25);
  }
});
