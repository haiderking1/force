import { composeOutline, translatedOutline } from "../../rendering/font/outline.ts";
import type { Shaper } from "../../rendering/font/shaper.ts";
import { PUA_FIRST, PUA_LAST } from "../../rendering/layout/pua.ts";
import type { GlyphOutline, TokenDirection } from "../../rendering/types.ts";
import { PatchError } from "../errors.ts";
import type { Font3AppendedGlyph } from "../gfx/font3/types.ts";
import { outlineToFont3Shape } from "./outline-to-shape.ts";
import { CUBIC_TO_QUAD_MAX_ERROR } from "./quadratic.ts";
import { fitsSigned16, font3ScaleFromUpem, scaleFont3Advance } from "./scale.ts";

export type PuaLabelUnit = {
  readonly code: number;
  readonly token: string;
  readonly direction: TokenDirection;
  readonly advance: number;
  readonly composed: boolean;
};

export type EncodedPuaLabel = {
  readonly id: string;
  readonly logical: string;
  readonly encoded: string;
  readonly units: readonly PuaLabelUnit[];
};

export type PuaLabelPlan = {
  readonly scale: number;
  readonly upem: number;
  readonly maxQuadError: number;
  readonly labels: readonly EncodedPuaLabel[];
  readonly glyphs: readonly Font3AppendedGlyph[];
  readonly mapping: ReadonlyMap<number, PuaLabelUnit>;
};

export type LabelRequest = {
  readonly id: string;
  readonly text: string;
  readonly direction?: TokenDirection;
};

function nextPua(used: boolean[]): number {
  const index = used.indexOf(false);
  if (index === -1) {
    throw new PatchError("LIMIT", "BMP private-use area U+E000..U+F8FF is exhausted");
  }
  used[index] = true;
  return PUA_FIRST + index;
}

function isSpaceToken(text: string): boolean {
  return text === " " || text === "\u00a0";
}

function unitKey(token: string, direction: TokenDirection, outline: GlyphOutline, advance: number): string {
  return JSON.stringify({
    token,
    direction,
    advance,
    commands: outline.commands,
  });
}

export function planPuaLabels(
  shaper: Shaper,
  labels: readonly LabelRequest[],
  options?: { readonly maxQuadError?: number },
): PuaLabelPlan {
  const family = shaper.family();
  if (family !== "Force") {
    throw new PatchError("GFX", `PUA label encoding requires the Force font, found ${family}`);
  }
  const upem = shaper.unitsPerEm();
  const scale = font3ScaleFromUpem(upem);
  const maxQuadError = options?.maxQuadError ?? CUBIC_TO_QUAD_MAX_ERROR;
  const used = new Array<boolean>(PUA_LAST - PUA_FIRST + 1).fill(false);
  const byKey = new Map<string, PuaLabelUnit>();
  const glyphs: Font3AppendedGlyph[] = [];
  const mapping = new Map<number, PuaLabelUnit>();
  const encodedLabels: EncodedPuaLabel[] = [];

  const allocate = (
    token: string,
    direction: TokenDirection,
    outline: GlyphOutline,
    fontAdvance: number,
    composed: boolean,
  ): PuaLabelUnit => {
    const key = unitKey(token, direction, outline, fontAdvance);
    const existing = byKey.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const advance = scaleFont3Advance(fontAdvance, scale);
    const shape = outlineToFont3Shape(outline, scale, maxQuadError);
    const code = nextPua(used);
    const unit: PuaLabelUnit = { code, token, direction, advance, composed };
    const glyph: Font3AppendedGlyph = {
      code,
      shapeBytes: shape.shapeBytes,
      advance,
      boundsBytes: shape.boundsBytes,
    };
    byKey.set(key, unit);
    glyphs.push(glyph);
    mapping.set(code, unit);
    return unit;
  };

  for (const label of labels) {
    if (label.text.length === 0) {
      throw new PatchError("VALIDATION", `Label ${label.id} is empty`);
    }
    const direction: TokenDirection = label.direction ?? "rtl";
    const shaped = shaper.shape(label.text, direction);
    const composed = composeOutline(shaper, shaped);
    const composedAdvance = shaped.advance();
    const units: PuaLabelUnit[] = [];
    if (fitsSigned16(Math.round(composedAdvance * scale))) {
      units.push(allocate(label.text, direction, composed, composedAdvance, true));
    } else {
      for (const glyph of shaped.glyphs) {
        const source = shaper.outline(glyph.glyphId);
        const outline = translatedOutline(source, glyph.xOffset, glyph.yOffset);
        if (glyph.xAdvance === 0 && outline.commands.length === 0) {
          continue;
        }
        units.push(
          allocate(
            `${glyph.glyphId}:${glyph.xOffset}:${glyph.yOffset}:${glyph.xAdvance}`,
            direction,
            outline,
            glyph.xAdvance,
            false,
          ),
        );
      }
      if (units.length === 0) {
        throw new PatchError("GFX", `Label ${label.id} produced no PUA units`);
      }
    }
    encodedLabels.push({
      id: label.id,
      logical: label.text,
      encoded: units.map((unit) => String.fromCodePoint(unit.code)).join(""),
      units,
    });
  }

  glyphs.sort((left, right) => left.code - right.code);
  return { scale, upem, maxQuadError, labels: encodedLabels, glyphs, mapping };
}

export function encodedLabelById(plan: PuaLabelPlan): Map<string, EncodedPuaLabel> {
  return new Map(plan.labels.map((label) => [label.id, label]));
}

export { isSpaceToken };
