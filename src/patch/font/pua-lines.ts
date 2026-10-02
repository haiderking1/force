import { LayoutEngine } from "../../rendering/engine.ts";
import { translatedOutline } from "../../rendering/font/outline.ts";
import type { GlyphOutline, LayoutResult } from "../../rendering/types.ts";
import { PatchError } from "../errors.ts";
import type { Font3AppendedGlyph } from "../gfx/font3/types.ts";
import { outlineToFont3Shape } from "./outline-to-shape.ts";
import { font3ScaleFromUpem, scaleFont3Advance, FONT3_EM } from "./scale.ts";

export type SubtitleProfile = {
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
};

/** Wrap logical text first, then encode each shaped line in left-to-right PUA order.
 * Explicit line breaks prevent an LTR game from wrapping a reversed paragraph.
 * Codes are allocated above the existing font's code table, preserving menu PUA.
 */
export function planPuaLines(
  engine: LayoutEngine,
  requests: readonly { readonly id: string; readonly text: string }[],
  profile: SubtitleProfile,
  firstCode: number,
) {
  if (!Number.isInteger(firstCode) || firstCode < 0xe000 || firstCode > 0xf8ff) {
    throw new PatchError("LIMIT", "Invalid first subtitle PUA code");
  }
  const shaper = engine.getShaper();
  const scale = font3ScaleFromUpem(shaper.unitsPerEm());
  const glyphs: Font3AppendedGlyph[] = [];
  const byKey = new Map<string, number>();
  const ids = new Set<string>();
  const empty: GlyphOutline = {
    commands: [], bounds: { xMin: 0, xMax: 0, yMin: 0, yMax: 0, empty: true },
  };
  const allocate = (key: string, advance: number, outline: () => GlyphOutline): string => {
    const existing = byKey.get(key);
    if (existing !== undefined) return String.fromCodePoint(existing);
    const code = firstCode + glyphs.length;
    if (code > 0xf8ff) throw new PatchError("LIMIT", "Subtitle glyphs exhausted BMP PUA");
    const shape = outlineToFont3Shape(outline(), scale);
    glyphs.push({ code, advance: scaleFont3Advance(advance, scale),
      shapeBytes: shape.shapeBytes, boundsBytes: shape.boundsBytes });
    byKey.set(key, code);
    return String.fromCodePoint(code);
  };
  const labels: { id: string; logical: string; encoded: string; layout: LayoutResult; widths: number[] }[] = [];
  for (const request of requests) {
    if (ids.has(request.id)) throw new PatchError("VALIDATION", `Duplicate subtitle ${request.id}`);
    ids.add(request.id);
    // Game control tokens require an adapter, not baked-in glyphs or silent loss.
    if (!request.text.trim() || /[{}<>\\]|\/[A-Za-z_]+\/|_[A-Z][A-Z0-9]+_/.test(request.text)) {
      throw new PatchError("VALIDATION", `Subtitle ${request.id} is not plain display text`);
    }
    const layout = engine.layout(request.text, { ...profile, alignment: "left", baseDirection: "rtl",
      placeholderPolicy: { mode: "unresolved-diagnostic", severity: "error" } });
    if (layout.diagnostics.length) throw new PatchError("VALIDATION", `Subtitle ${request.id} has layout diagnostics`);
    const widths: number[] = [];
    const lines = layout.lines.map((line) => {
      let encoded = "";
      let pen = 0;
      let advance = 0;
      for (const glyph of line.glyphs) {
        const gap = glyph.x - glyph.xOffset - pen;
        if (gap !== 0) {
          encoded += allocate(`space:${gap}`, gap, () => empty);
          advance += scaleFont3Advance(gap, scale);
          pen += gap;
        }
        const key = JSON.stringify([glyph.glyphId, glyph.xOffset, glyph.yOffset, glyph.xAdvance]);
        encoded += allocate(key, glyph.xAdvance, () => translatedOutline(
          shaper.outline(glyph.glyphId), glyph.xOffset, glyph.yOffset));
        advance += scaleFont3Advance(glyph.xAdvance, scale);
        pen += glyph.xAdvance;
      }
      const width = advance / FONT3_EM * profile.fontSize;
      if (width > profile.width) throw new PatchError("LIMIT", `Encoded subtitle ${request.id} exceeds width`);
      widths.push(width);
      return encoded;
    });
    labels.push({ id: request.id, logical: request.text, encoded: lines.join("\n"), layout, widths });
  }
  return { glyphs, labels };
}
