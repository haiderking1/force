import { RenderingError } from "../errors.ts";
import type {
  GlyphOutline,
  OutlineBounds,
  OutlineCommand,
  OutlinePoint,
  ShapedText,
} from "../types.ts";

function checkedAdd(a: number, b: number, name: string): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum < -2147483648 || sum > 2147483647) {
    throw new RenderingError(`${name} exceeds signed 32-bit font units`, "COORDINATE_OVERFLOW");
  }
  return sum;
}

export function includePoint(bounds: OutlineBounds, pt: OutlinePoint): OutlineBounds {
  if (bounds.empty) {
    return {
      xMin: pt.x,
      yMin: pt.y,
      xMax: pt.x,
      yMax: pt.y,
      empty: false,
    };
  }
  return {
    xMin: Math.min(bounds.xMin, pt.x),
    yMin: Math.min(bounds.yMin, pt.y),
    xMax: Math.max(bounds.xMax, pt.x),
    yMax: Math.max(bounds.yMax, pt.y),
    empty: false,
  };
}

export function translatedOutline(
  outline: GlyphOutline,
  xOffset: number,
  yOffset: number,
): GlyphOutline {
  let bounds: OutlineBounds = { xMin: 0, yMin: 0, xMax: 0, yMax: 0, empty: true };
  const commands: OutlineCommand[] = [];

  for (const cmd of outline.commands) {
    const a: OutlinePoint = {
      x: checkedAdd(cmd.a.x, xOffset, "translated outline x coordinate"),
      y: checkedAdd(cmd.a.y, yOffset, "translated outline y coordinate"),
    };
    bounds = includePoint(bounds, a);

    if (cmd.op === "cubic") {
      const b: OutlinePoint = {
        x: checkedAdd(cmd.b?.x ?? 0, xOffset, "translated outline x coordinate"),
        y: checkedAdd(cmd.b?.y ?? 0, yOffset, "translated outline y coordinate"),
      };
      const c: OutlinePoint = {
        x: checkedAdd(cmd.c?.x ?? 0, xOffset, "translated outline x coordinate"),
        y: checkedAdd(cmd.c?.y ?? 0, yOffset, "translated outline y coordinate"),
      };
      bounds = includePoint(bounds, b);
      bounds = includePoint(bounds, c);
      commands.push({ op: "cubic", a, b, c });
    } else if (cmd.op === "quad") {
      const b: OutlinePoint = {
        x: checkedAdd(cmd.b?.x ?? 0, xOffset, "translated outline x coordinate"),
        y: checkedAdd(cmd.b?.y ?? 0, yOffset, "translated outline y coordinate"),
      };
      bounds = includePoint(bounds, b);
      commands.push({ op: "quad", a, b });
    } else if (cmd.op === "close") {
      commands.push({ op: "close", a });
    } else {
      commands.push({ op: cmd.op, a });
    }
  }

  return { commands, bounds };
}

export function appendOutline(target: GlyphOutline, source: GlyphOutline): GlyphOutline {
  let bounds = target.bounds;
  if (!source.bounds.empty) {
    bounds = includePoint(bounds, { x: source.bounds.xMin, y: source.bounds.yMin });
    bounds = includePoint(bounds, { x: source.bounds.xMax, y: source.bounds.yMax });
  }
  return {
    commands: [...target.commands, ...source.commands],
    bounds,
  };
}

export interface OutlineSource {
  outline(glyphId: number): GlyphOutline;
}

export function composeOutline(source: OutlineSource, shaped: ShapedText): GlyphOutline {
  let result: GlyphOutline = {
    commands: [],
    bounds: { xMin: 0, yMin: 0, xMax: 0, yMax: 0, empty: true },
  };

  let penX = shaped.signedAdvance < 0 ? shaped.advance() : 0;
  let penY = 0;

  for (const glyph of shaped.glyphs) {
    const x = checkedAdd(penX, glyph.xOffset, "glyph x translation");
    const y = checkedAdd(penY, glyph.yOffset, "glyph y translation");
    const glyphOutline = source.outline(glyph.glyphId);
    const translated = translatedOutline(glyphOutline, x, y);
    result = appendOutline(result, translated);

    penX = checkedAdd(penX, glyph.xAdvance, "glyph x pen");
    penY = checkedAdd(penY, glyph.yAdvance, "glyph y pen");
  }

  return result;
}
