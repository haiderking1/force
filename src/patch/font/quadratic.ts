import { PatchError } from "../errors.ts";
import type { OutlinePoint } from "../../rendering/types.ts";

export const CUBIC_TO_QUAD_MAX_ERROR = 1;

export type QuadraticSegment = {
  readonly p0: OutlinePoint;
  readonly p1: OutlinePoint;
  readonly p2: OutlinePoint;
};

export type CubicSegment = {
  readonly p0: OutlinePoint;
  readonly p1: OutlinePoint;
  readonly p2: OutlinePoint;
  readonly p3: OutlinePoint;
};

function lerp(a: OutlinePoint, b: OutlinePoint, t: number): OutlinePoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function cubicPoint(cubic: CubicSegment, t: number): OutlinePoint {
  const ab = lerp(cubic.p0, cubic.p1, t);
  const bc = lerp(cubic.p1, cubic.p2, t);
  const cd = lerp(cubic.p2, cubic.p3, t);
  const abc = lerp(ab, bc, t);
  const bcd = lerp(bc, cd, t);
  return lerp(abc, bcd, t);
}

export function quadPoint(quad: QuadraticSegment, t: number): OutlinePoint {
  const ab = lerp(quad.p0, quad.p1, t);
  const bc = lerp(quad.p1, quad.p2, t);
  return lerp(ab, bc, t);
}

export function splitCubic(cubic: CubicSegment, t = 0.5): readonly [CubicSegment, CubicSegment] {
  const ab = lerp(cubic.p0, cubic.p1, t);
  const bc = lerp(cubic.p1, cubic.p2, t);
  const cd = lerp(cubic.p2, cubic.p3, t);
  const abc = lerp(ab, bc, t);
  const bcd = lerp(bc, cd, t);
  const mid = lerp(abc, bcd, t);
  return [
    { p0: cubic.p0, p1: ab, p2: abc, p3: mid },
    { p0: mid, p1: bcd, p2: cd, p3: cubic.p3 },
  ];
}

export function cubicToSingleQuad(cubic: CubicSegment): QuadraticSegment {
  return {
    p0: cubic.p0,
    p1: {
      x: (3 * cubic.p1.x - cubic.p0.x + 3 * cubic.p2.x - cubic.p3.x) / 4,
      y: (3 * cubic.p1.y - cubic.p0.y + 3 * cubic.p2.y - cubic.p3.y) / 4,
    },
    p2: cubic.p3,
  };
}

export function cubicQuadError(cubic: CubicSegment, quad: QuadraticSegment, samples = 16): number {
  let max = 0;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const c = cubicPoint(cubic, t);
    const q = quadPoint(quad, t);
    const dx = c.x - q.x;
    const dy = c.y - q.y;
    const dist = Math.hypot(dx, dy);
    if (dist > max) {
      max = dist;
    }
  }
  return max;
}

export function cubicToQuadratics(
  cubic: CubicSegment,
  maxError: number = CUBIC_TO_QUAD_MAX_ERROR,
  depth = 0,
): readonly QuadraticSegment[] {
  if (!(maxError > 0) || !Number.isFinite(maxError)) {
    throw new PatchError("GFX", `Cubic-to-quadratic max error must be a positive finite number, got ${maxError}`);
  }
  if (depth > 16) {
    throw new PatchError("GFX", `Cubic-to-quadratic subdivision exceeded 16 levels at error bound ${maxError}`);
  }
  const quad = cubicToSingleQuad(cubic);
  if (cubicQuadError(cubic, quad) <= maxError) {
    return [quad];
  }
  const [left, right] = splitCubic(cubic);
  return [...cubicToQuadratics(left, maxError, depth + 1), ...cubicToQuadratics(right, maxError, depth + 1)];
}
