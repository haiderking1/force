import { readFileSync } from "fs";
import * as hb from "harfbuzzjs";
import bidiFactory from "bidi-js";
import { FontError, RenderingError } from "../errors.ts";
import type {
  GlyphMetrics,
  GlyphOutline,
  OutlineBounds,
  OutlineCommand,
  ShapedGlyph,
  TokenDirection,
} from "../types.ts";
import { ShapedText } from "../types.ts";
import { parseSfntDirectory } from "./metrics.ts";
import { includePoint } from "./outline.ts";

function checkedAdd(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum < -2147483648 || sum > 2147483647) {
    throw new RenderingError("shaped token advance exceeds 32-bit font units", "COORDINATE_OVERFLOW");
  }
  return sum;
}

export type ShaperOptions = {
  readonly expectedFamily?: string;
};

export class Shaper {
  private readonly blob: hb.Blob;
  private readonly face: hb.Face;
  private readonly font: hb.Font;
  private readonly upem: number;
  private readonly familyName: string;
  private readonly numGlyphs: number;
  private destroyed = false;

  private constructor(
    blob: hb.Blob,
    face: hb.Face,
    font: hb.Font,
    upem: number,
    familyName: string,
    numGlyphs: number,
  ) {
    this.blob = blob;
    this.face = face;
    this.font = font;
    this.upem = upem;
    this.familyName = familyName;
    this.numGlyphs = numGlyphs;
  }

  static open(fontSource: string | Uint8Array, options?: ShaperOptions): Shaper {
    const bytes = typeof fontSource === "string" ? new Uint8Array(readFileSync(fontSource)) : fontSource;

    const tables = parseSfntDirectory(bytes);
    if (!tables.has("CFF ") && !tables.has("glyf")) {
      throw new FontError("Ara/Force input font must contain OpenType/CFF or TrueType outlines", "MISSING_OUTLINES");
    }

    const blob = new hb.Blob(bytes);
    const face = new hb.Face(blob, 0);
    const upem = face.upem;
    if (!upem || upem <= 0) {
      throw new FontError("input font has invalid units_per_em", "INVALID_UPEM");
    }

    const font = new hb.Font(face);
    font.setScale(upem, upem);

    let family = "";
    try {
      family = face.getName(1, "en") || face.getName(4, "en") || "";
    } catch {
      // Name table fallback
    }

    if (options?.expectedFamily && family !== options.expectedFamily) {
      throw new FontError(
        `input font family must be ${options.expectedFamily}, found ${family}`,
        "INVALID_FAMILY",
      );
    }

    // Determine glyph count: max glyph ID from collectUnicodes + 1 or hmtx / maxp table
    let maxGlyphId = 0;
    try {
      const maxp = tables.get("maxp");
      if (maxp && maxp.length >= 6) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + maxp.offset, maxp.length);
        maxGlyphId = view.getUint16(4, false);
      }
    } catch {
      // fallback
    }

    if (maxGlyphId <= 0) {
      const unicodes = face.collectUnicodes();
      for (const cp of unicodes) {
        if (cp !== undefined) {
          const gid = font.nominalGlyph(cp);
          if (gid !== undefined && gid > maxGlyphId) maxGlyphId = gid;
        }
      }
      maxGlyphId += 1;
    }

    return new Shaper(blob, face, font, upem, family, maxGlyphId);
  }

  private checkDestroyed(): void {
    if (this.destroyed) {
      throw new FontError("Shaper has been destroyed", "SHAPER_DESTROYED");
    }
  }

  unitsPerEm(): number {
    this.checkDestroyed();
    return this.upem;
  }

  family(): string {
    this.checkDestroyed();
    return this.familyName;
  }

  glyphCount(): number {
    this.checkDestroyed();
    return this.numGlyphs;
  }

  shape(text: string, direction: TokenDirection): ShapedText {
    this.checkDestroyed();
    if (direction === "spacer") {
      throw new RenderingError("spacer is not a text shaping direction", "INVALID_DIRECTION");
    }

    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.setDirection(direction === "rtl" ? hb.Direction.RTL : hb.Direction.LTR);
    buffer.guessSegmentProperties();
    hb.shape(this.font, buffer);

    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();

    const glyphs: ShapedGlyph[] = [];
    let signedAdvance = 0;

    for (let i = 0; i < infos.length; i += 1) {
      const info = infos[i];
      const pos = positions[i];
      if (!info || !pos) continue;

      glyphs.push({
        glyphId: info.codepoint,
        xAdvance: pos.xAdvance,
        yAdvance: pos.yAdvance,
        xOffset: pos.xOffset,
        yOffset: pos.yOffset,
        cluster: info.cluster,
        flags: info.flags,
      });

      signedAdvance = checkedAdd(signedAdvance, pos.xAdvance);
    }

    return new ShapedText(glyphs, signedAdvance);
  }

  shapeAuto(text: string): ShapedText {
    this.checkDestroyed();
    if (text.length === 0) {
      return this.shape("", "ltr");
    }
    const bidi = bidiFactory();
    const embedding = bidi.getEmbeddingLevels(text);
    const firstLevel = embedding.levels[0] ?? 0;
    const tokenDir: TokenDirection = (firstLevel & 1) !== 0 ? "rtl" : "ltr";
    return this.shape(text, tokenDir);
  }

  outline(glyphId: number): GlyphOutline {
    this.checkDestroyed();
    if (glyphId < 0 || glyphId >= this.numGlyphs) {
      throw new FontError(`glyph ID ${glyphId} is outside the font bounds`, "GLYPH_OUT_OF_BOUNDS");
    }

    const rawCommands = this.font.glyphToJson(glyphId);
    let bounds: OutlineBounds = { xMin: 0, yMin: 0, xMax: 0, yMax: 0, empty: true };
    const commands: OutlineCommand[] = [];

    let contourStart = { x: 0, y: 0 };
    for (const cmd of rawCommands) {
      if (cmd.type === "M") {
        const x = cmd.values[0] ?? 0;
        const y = cmd.values[1] ?? 0;
        const a = { x, y };
        contourStart = a;
        bounds = includePoint(bounds, a);
        commands.push({ op: "move", a });
      } else if (cmd.type === "L") {
        const x = cmd.values[0] ?? 0;
        const y = cmd.values[1] ?? 0;
        const a = { x, y };
        bounds = includePoint(bounds, a);
        commands.push({ op: "line", a });
      } else if (cmd.type === "Q") {
        const cx = cmd.values[0] ?? 0;
        const cy = cmd.values[1] ?? 0;
        const x = cmd.values[2] ?? 0;
        const y = cmd.values[3] ?? 0;
        const a = { x: cx, y: cy };
        const b = { x, y };
        bounds = includePoint(bounds, a);
        bounds = includePoint(bounds, b);
        commands.push({ op: "quad", a, b });
      } else if (cmd.type === "C") {
        const c1x = cmd.values[0] ?? 0;
        const c1y = cmd.values[1] ?? 0;
        const c2x = cmd.values[2] ?? 0;
        const c2y = cmd.values[3] ?? 0;
        const x = cmd.values[4] ?? 0;
        const y = cmd.values[5] ?? 0;

        const a = { x: c1x, y: c1y };
        const b = { x: c2x, y: c2y };
        const c = { x, y };

        bounds = includePoint(bounds, a);
        bounds = includePoint(bounds, b);
        bounds = includePoint(bounds, c);
        commands.push({ op: "cubic", a, b, c });
      } else if (cmd.type === "Z") {
        commands.push({ op: "close", a: contourStart });
      }
    }

    return { commands, bounds };
  }

  metrics(glyphId: number): GlyphMetrics {
    this.checkDestroyed();
    if (glyphId < 0 || glyphId >= this.numGlyphs) {
      throw new FontError(`glyph ID ${glyphId} is outside the font bounds`, "GLYPH_OUT_OF_BOUNDS");
    }

    const advance = this.font.glyphHAdvance(glyphId);
    const extents = this.font.glyphExtents(glyphId);
    const leftSideBearing = extents ? extents.xBearing : 0;

    return { advance, leftSideBearing };
  }

  cmap(): Map<number, number> {
    this.checkDestroyed();
    const map = new Map<number, number>();
    const unicodes = this.face.collectUnicodes();
    for (const cp of unicodes) {
      if (cp !== undefined) {
        const gid = this.font.nominalGlyph(cp);
        if (gid !== undefined && gid !== 0) {
          map.set(cp, gid);
        }
      }
    }
    return map;
  }

  destroy(): void {
    if (!this.destroyed) {
      this.destroyed = true;
    }
  }
}
