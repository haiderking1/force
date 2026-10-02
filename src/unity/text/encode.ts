import { visualRuns } from "../../rendering/layout/bidi-runs.ts";
import { wrapLines } from "../../rendering/layout/wrap.ts";
import { parseUnityRichText } from "./rich-text.ts";
import { UnityGlyphs } from "./glyphs.ts";

export type UnityTextProfile = {
  readonly widthEm: number;
  readonly maxLines: number;
  readonly pairedTags: ReadonlySet<string>;
};

/** Static visual encoding. Explicit logical wrapping precedes bidi and shaping.
 * It is not a runtime typewriter, variable substitution, or dynamic-layout fix.
 */
export function encodeUnityText(text: string, glyphs: UnityGlyphs, profile: UnityTextProfile): string {
  if (!Number.isFinite(profile.widthEm) || profile.widthEm <= 0 || !Number.isSafeInteger(profile.maxLines) || profile.maxLines < 1)
    throw new Error("Invalid Unity text profile");
  const parsed = parseUnityRichText(text, profile.pairedTags);
  const width = Math.floor(profile.widthEm * glyphs.shaper.unitsPerEm());
  const wrapped = wrapLines(glyphs.shaper, parsed.lines, width, "rtl");
  if (wrapped.length > profile.maxLines) throw new Error("Text exceeds explicit line limit");
  return wrapped.map(line => {
    let encoded = "";
    let active: readonly number[] = [];
    const setStyles = (next: readonly number[]): void => {
      let shared = 0;
      while (shared < active.length && shared < next.length && active[shared] === next[shared]) shared++;
      for (let i = active.length - 1; i >= shared; i--) {
        const id = active[i];
        const style = id === undefined ? undefined : parsed.styles[id];
        if (!style) throw new Error("Invalid style index");
        encoded += style.close;
      }
      for (const id of next.slice(shared)) {
        const style = parsed.styles[id];
        if (!style) throw new Error("Invalid style index");
        encoded += style.open;
      }
      active = next;
    };
    for (const run of visualRuns(line.chars, "rtl")) {
      setStyles(run.styles);
      if (run.direction !== "rtl") {
        encoded += run.text;
        continue;
      }
      for (const glyph of glyphs.shaper.shape(run.text, run.direction).glyphs) {
        encoded += glyphs.encode(glyph.glyphId, glyph.xOffset, glyph.yOffset, glyph.xAdvance);
      }
    }
    setStyles([]);
    return encoded;
  }).join("\n");
}
