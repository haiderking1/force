import { translatedOutline } from "../../rendering/font/outline.ts";
import type { Shaper } from "../../rendering/font/shaper.ts";
import type { GlyphOutline } from "../../rendering/types.ts";
import { PatchError } from "../errors.ts";
import type { Font3AppendedGlyph } from "../gfx/font3/types.ts";
import { outlineToFont3Shape } from "./outline-to-shape.ts";
import { font3ScaleFromUpem, scaleFont3Advance } from "./scale.ts";

const emptyOutline: GlyphOutline = {
  commands: [],
  bounds: { xMin: 0, xMax: 0, yMin: 0, yMax: 0, empty: true },
};

export class PuaGlyphAllocator {
  readonly glyphs: Font3AppendedGlyph[] = [];
  private readonly byKey = new Map<string, number>();
  private readonly scale: number;
  private readonly firstCode: number;

  constructor(shaper: Shaper, firstCode: number) {
    if (!Number.isInteger(firstCode) || firstCode < 0xe000 || firstCode > 0xf8ff) {
      throw new PatchError("LIMIT", "Invalid first subtitle PUA code");
    }
    this.firstCode = firstCode;
    this.scale = font3ScaleFromUpem(shaper.unitsPerEm());
  }

  get scaleFactor(): number {
    return this.scale;
  }

  space(advance: number): string {
    return this.allocate(`space:${advance}`, advance, () => emptyOutline);
  }

  glyph(shaper: Shaper, glyphId: number, xOffset: number, yOffset: number, xAdvance: number): string {
    const key = JSON.stringify([glyphId, xOffset, yOffset, xAdvance]);
    return this.allocate(key, xAdvance, () => translatedOutline(shaper.outline(glyphId), xOffset, yOffset));
  }

  private allocate(key: string, advance: number, outline: () => GlyphOutline): string {
    const existing = this.byKey.get(key);
    if (existing !== undefined) {
      return String.fromCodePoint(existing);
    }
    const code = this.firstCode + this.glyphs.length;
    if (code > 0xf8ff) {
      throw new PatchError("LIMIT", "Subtitle glyphs exhausted BMP PUA");
    }
    const shape = outlineToFont3Shape(outline(), this.scale);
    this.glyphs.push({
      code,
      advance: scaleFont3Advance(advance, this.scale),
      shapeBytes: shape.shapeBytes,
      boundsBytes: shape.boundsBytes,
    });
    this.byKey.set(key, code);
    return String.fromCodePoint(code);
  }
}
