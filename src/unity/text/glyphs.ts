import type { Shaper } from "../../rendering/font/shaper.ts";
import type { GlyphOutline } from "../../rendering/types.ts";
import { translatedOutline } from "../../rendering/font/outline.ts";

export type UnityGlyph = { readonly code: number; readonly glyphId: number; readonly advance: number; readonly outline: GlyphOutline };

/** Engine-neutral outlined PUA glyphs. TMP rasterization is a separate step. */
export class UnityGlyphs {
  readonly glyphs: UnityGlyph[] = [];
  private readonly keys = new Map<string, number>();
  constructor(readonly shaper: Shaper, readonly firstCode = 0xe800) {
    if (!Number.isInteger(firstCode) || firstCode < 0xe000 || firstCode > 0xf8ff) throw new Error("Invalid PUA range");
  }
  encode(glyphId: number, xOffset: number, yOffset: number, advance: number): string {
    if (glyphId === 0) throw new Error("Force font has a missing glyph");
    const key = JSON.stringify([glyphId, xOffset, yOffset, advance]);
    let code = this.keys.get(key);
    if (code === undefined) {
      code = this.firstCode + this.glyphs.length;
      if (code > 0xf8ff) throw new Error("PUA glyph capacity exceeded");
      this.keys.set(key, code);
      this.glyphs.push({ code, glyphId, advance, outline: translatedOutline(this.shaper.outline(glyphId), xOffset, yOffset) });
    }
    return String.fromCodePoint(code);
  }
}
