import { MissingGlyphError, RenderingError } from "../errors.ts";
import type { BaseDirection, Character, Run, VisualToken } from "../types.ts";
import type { Shaper } from "../font/shaper.ts";
import { logicalDirectionalRuns } from "../unicode/bidi.ts";
import { visualRuns } from "./bidi-runs.ts";

function checkedAdd(a: number, b: number, name: string): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum < -2147483648 || sum > 2147483647) {
    throw new RenderingError(`${name} exceeds 32-bit font units`, "COORDINATE_OVERFLOW");
  }
  return sum;
}

function checkedMultiply(a: number, b: number, name: string): number {
  const product = a * b;
  if (!Number.isSafeInteger(product) || product < -2147483648 || product > 2147483647) {
    throw new RenderingError(`${name} exceeds 32-bit font units`, "COORDINATE_OVERFLOW");
  }
  return product;
}

export function measureText(shaper: Shaper, text: string): number {
  let total = 0;
  for (const run of logicalDirectionalRuns(text)) {
    const shaped = shaper.shape(run.text, run.direction);
    for (const glyph of shaped.glyphs) {
      if (glyph.glyphId === 0) {
        throw new MissingGlyphError("measure: text contains a glyph missing from font");
      }
    }
    total = checkedAdd(total, shaped.advance(), "measured text advance");
  }
  return total;
}

export function measureVisualTokens(shaper: Shaper, tokens: readonly VisualToken[]): number {
  let total = 0;
  const spaceAdvance = shaper.shape(" ", "ltr").advance();

  for (const token of tokens) {
    if (token.direction === "spacer") {
      total = checkedAdd(total, spaceAdvance, "token spacer advance");
    } else {
      const shaped = shaper.shape(token.text, token.direction);
      total = checkedAdd(total, shaped.advance(), "token visual advance");
    }
  }

  return total;
}

export function measureAdvance(shaper: Shaper, run: Run): number {
  if (run.reservedAdvance !== undefined) {
    return run.reservedAdvance;
  }

  if (run.direction === "spacer") {
    const shaped = shaper.shape(" ", "ltr");
    return checkedMultiply(shaped.advance(), run.text.length, "spacer advance");
  }

  const shaped = shaper.shape(run.text, run.direction);
  for (const glyph of shaped.glyphs) {
    if (glyph.glyphId === 0) {
      throw new MissingGlyphError("layout: text contains a glyph missing from font");
    }
  }
  return shaped.advance();
}

export function measureLineAdvance(
  shaper: Shaper,
  line: readonly Character[],
  baseDirection: BaseDirection = "rtl",
): number {
  let total = 0;
  for (const run of visualRuns(line, baseDirection)) {
    total = checkedAdd(total, measureAdvance(shaper, run), "line advance");
  }
  return total;
}
