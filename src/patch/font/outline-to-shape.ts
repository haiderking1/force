import type { GlyphOutline, OutlinePoint } from "../../rendering/types.ts";
import { PatchError } from "../errors.ts";
import { encodeFontShape, type FontShapeRecord } from "../gfx/shape.ts";
import { encodeSwfRect } from "../gfx/rect.ts";
import { CUBIC_TO_QUAD_MAX_ERROR, cubicToQuadratics, type CubicSegment } from "./quadratic.ts";
import { scaleFont3Coordinate } from "./scale.ts";

export type ScaledOutline = {
  readonly records: readonly FontShapeRecord[];
  readonly shapeBytes: Uint8Array;
  readonly boundsBytes: Uint8Array;
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
};

function samePoint(a: OutlinePoint, b: OutlinePoint): boolean {
  return a.x === b.x && a.y === b.y;
}

export function outlineToFont3Shape(
  outline: GlyphOutline,
  scale: number,
  maxQuadError: number = CUBIC_TO_QUAD_MAX_ERROR,
): ScaledOutline {
  const records: FontShapeRecord[] = [];
  let current: OutlinePoint | undefined;
  let contourStart: OutlinePoint | undefined;
  let xMin = 0;
  let yMin = 0;
  let xMax = 0;
  let yMax = 0;
  let empty = true;

  const include = (point: OutlinePoint): void => {
    if (empty) {
      xMin = point.x;
      yMin = point.y;
      xMax = point.x;
      yMax = point.y;
      empty = false;
      return;
    }
    xMin = Math.min(xMin, point.x);
    yMin = Math.min(yMin, point.y);
    xMax = Math.max(xMax, point.x);
    yMax = Math.max(yMax, point.y);
  };

  const toSwf = (point: OutlinePoint): OutlinePoint => ({
    x: scaleFont3Coordinate(point.x, scale),
    y: scaleFont3Coordinate(-point.y, scale),
  });

  const closeContour = (): void => {
    if (current === undefined || contourStart === undefined) {
      return;
    }
    if (!samePoint(current, contourStart)) {
      records.push({ kind: "line", x: contourStart.x, y: contourStart.y });
      current = contourStart;
    }
  };

  for (const command of outline.commands) {
    if (command.op === "move") {
      closeContour();
      const point = toSwf(command.a);
      records.push({ kind: "move", x: point.x, y: point.y, fillStyle0: 1 });
      current = point;
      contourStart = point;
      include(point);
      continue;
    }
    if (current === undefined || contourStart === undefined) {
      throw new PatchError("GFX", "Font outline started without a move");
    }
    if (command.op === "line") {
      const point = toSwf(command.a);
      records.push({ kind: "line", x: point.x, y: point.y });
      current = point;
      include(point);
      continue;
    }
    if (command.op === "quad") {
      const control = toSwf(command.a);
      const point = toSwf(command.b ?? command.a);
      records.push({ kind: "curve", controlX: control.x, controlY: control.y, x: point.x, y: point.y });
      current = point;
      include(control);
      include(point);
      continue;
    }
    if (command.op === "cubic") {
      const cubic: CubicSegment = {
        p0: current,
        p1: toSwf(command.a),
        p2: toSwf(command.b ?? command.a),
        p3: toSwf(command.c ?? command.a),
      };
      for (const quad of cubicToQuadratics(cubic, maxQuadError)) {
        const control = {
          x: Math.round(quad.p1.x),
          y: Math.round(quad.p1.y),
        };
        const point = {
          x: Math.round(quad.p2.x),
          y: Math.round(quad.p2.y),
        };
        records.push({ kind: "curve", controlX: control.x, controlY: control.y, x: point.x, y: point.y });
        current = point;
        include(control);
        include(point);
      }
      continue;
    }
    if (command.op === "close") {
      closeContour();
    }
  }
  closeContour();

  const shapeBytes = encodeFontShape(records);
  const boundsBytes = empty
    ? encodeSwfRect(0, 0, 0, 0)
    : encodeSwfRect(xMin, xMax, yMin, yMax);
  return { records, shapeBytes, boundsBytes, xMin, yMin, xMax, yMax };
}
