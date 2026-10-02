import { InvalidProfileError, LayoutOverflowError, RenderingError } from "./errors.ts";
import type {
  BaseDirection,
  Character,
  LayoutDiagnostic,
  LayoutResult,
  Line,
  PositionedGlyph,
  PositionedLine,
  Profile,
} from "./types.ts";
import { Shaper } from "./font/shaper.ts";
import { fontLineUnits } from "./font/metrics.ts";
import { validateProfile, widthUnits } from "./layout/profile.ts";
import { wrapLines } from "./layout/wrap.ts";
import { visualRuns } from "./layout/bidi-runs.ts";
import { measureAdvance } from "./layout/measure.ts";
import { prepareGameLines, type PlaceholderPolicy } from "./syntax/tokens.ts";
import { readFileSync } from "fs";

export type LayoutOptions = {
  readonly width: number;
  readonly fontSize: number;
  readonly height?: number;
  readonly minimumSize?: number;
  readonly padding?: number;
  readonly lineGap?: number;
  readonly baseDirection?: BaseDirection;
  readonly alignment?: "left" | "right" | "center";
  readonly placeholderPolicy?: PlaceholderPolicy;
  readonly expandLiteralEscapes?: boolean;
};

export class LayoutEngine {
  private readonly shaper: Shaper;
  private readonly lineUnits: number;

  constructor(shaper: Shaper, fontBytes?: Uint8Array) {
    this.shaper = shaper;
    if (fontBytes) {
      this.lineUnits = fontLineUnits(fontBytes);
    } else {
      // Default line units calculation fallback if raw bytes not passed
      this.lineUnits = Math.round(shaper.unitsPerEm() * 1.5);
    }
  }

  static fromFont(
    fontSource: string | Uint8Array,
    options?: { expectedFamily?: string },
  ): { engine: LayoutEngine; shaper: Shaper } {
    const bytes =
      typeof fontSource === "string" ? new Uint8Array(readFileSync(fontSource)) : fontSource;
    const shaper = Shaper.open(bytes, options);
    const engine = new LayoutEngine(shaper, bytes);
    return { engine, shaper };
  }

  getShaper(): Shaper {
    return this.shaper;
  }

  layout(text: string, options: LayoutOptions): LayoutResult {
    const { paragraphs, diagnostics } = prepareGameLines(text, {
      placeholderPolicy: options.placeholderPolicy,
      expandLiteralEscapes: options.expandLiteralEscapes,
    });
    return this.layoutPrepared(paragraphs, diagnostics, options);
  }

  layoutPrepared(
    paragraphs: readonly Line[],
    diagnostics: readonly LayoutDiagnostic[],
    options: LayoutOptions,
  ): LayoutResult {
    const upem = this.shaper.unitsPerEm();

    const profile: Profile = {
      width: options.width,
      size: options.fontSize,
      height: options.height,
      minimumSize: options.minimumSize,
      padding: options.padding,
      lineGap: options.lineGap,
    };

    validateProfile(profile);

    const baseDir: BaseDirection = options.baseDirection ?? "rtl";

    const minimum = profile.minimumSize && profile.minimumSize > 0 ? profile.minimumSize : profile.size;
    const lineGap = options.lineGap ?? 0;

    let chosenFontSize = options.fontSize;
    let wrappedLines: readonly Line[] | undefined;

    for (let size = profile.size; size >= minimum; size -= 1) {
      try {
        const targetWidth = widthUnits(profile, size, upem);
        const lines = wrapLines(this.shaper, paragraphs, targetWidth, baseDir);
        const count =
          lines.length === 1 && lines[0]?.chars.length === 0 && !lines[0]?.newline
            ? 0
            : lines.length;

        const lineHeight = Math.floor((this.lineUnits * size + upem - 1) / upem) + lineGap;
        if (profile.height && profile.height > 0) {
          const maxLines = Math.floor(profile.height / lineHeight);
          if (count > maxLines) {
            continue;
          }
        }
        chosenFontSize = size;
        wrappedLines = lines;
        break;
      } catch (err) {
        if (err instanceof LayoutOverflowError) continue;
        throw err;
      }
    }

    if (!wrappedLines) {
      throw new LayoutOverflowError("text cannot fit its requested layout profile");
    }

    const fontSize = chosenFontSize;
    const scale = fontSize / upem;
    const targetWidthUnits = widthUnits(profile, fontSize, upem);
    const lineHeightPx = Math.floor((this.lineUnits * fontSize + upem - 1) / upem) + lineGap;

    const alignment = options.alignment ?? (baseDir === "rtl" ? "right" : "left");
    const spaceAdvance = this.shaper.shape(" ", "ltr").advance();

    const positionedLines: PositionedLine[] = [];

    for (let lineIndex = 0; lineIndex < wrappedLines.length; lineIndex += 1) {
      const line = wrappedLines[lineIndex];
      if (!line) continue;

      const runs = visualRuns(line.chars, baseDir);
      let lineWidthUnits = 0;
      for (const run of runs) {
        lineWidthUnits += measureAdvance(this.shaper, run);
      }

      let lineText = "";
      for (const run of runs) {
        lineText += run.text;
      }

      // Compute starting pen in font units according to alignment
      let penXUnits = 0;
      if (alignment === "right") {
        penXUnits = Math.max(0, targetWidthUnits - lineWidthUnits);
      } else if (alignment === "center") {
        penXUnits = Math.max(0, Math.floor((targetWidthUnits - lineWidthUnits) / 2));
      } else {
        penXUnits = 0;
      }

      const glyphs: PositionedGlyph[] = [];
      const penYUnits = 0;

      for (const run of runs) {
        if (run.reservedAdvance !== undefined) {
          penXUnits += run.reservedAdvance;
        } else if (run.direction === "spacer") {
          const adv = spaceAdvance * run.text.length;
          penXUnits += adv;
        } else {
          const shaped = this.shaper.shape(run.text, run.direction);
          for (const g of shaped.glyphs) {
            glyphs.push({
              glyphId: g.glyphId,
              x: penXUnits + g.xOffset,
              y: penYUnits + g.yOffset,
              xAdvance: g.xAdvance,
              yAdvance: g.yAdvance,
              xOffset: g.xOffset,
              yOffset: g.yOffset,
              cluster: g.cluster,
            });
            penXUnits += g.xAdvance;
          }
        }
      }

      const lineYPx = lineIndex * lineHeightPx;
      const lineWidthPx = lineWidthUnits * scale;

      positionedLines.push({
        lineIndex,
        y: lineYPx,
        width: lineWidthPx,
        height: lineHeightPx,
        glyphs,
        runs,
        text: lineText,
      });
    }

    const totalWidth = options.width;
    const totalHeight = Math.max(positionedLines.length * lineHeightPx, lineHeightPx);

    return {
      lines: positionedLines,
      totalWidth,
      totalHeight,
      fontSize,
      unitsPerEm: upem,
      scale,
      baseDirection: baseDir,
      diagnostics,
    };
  }
}
