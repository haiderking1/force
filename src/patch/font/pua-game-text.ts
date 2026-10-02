import { LayoutEngine } from "../../rendering/engine.ts";
import { LayoutOverflowError } from "../../rendering/errors.ts";
import type { LayoutResult, Run } from "../../rendering/types.ts";
import { PatchError } from "../errors.ts";
import type { Font3AppendedGlyph } from "../gfx/font3/types.ts";
import { unescapeCorpusText } from "./display-text.ts";
import { prepareGameSegments } from "./game-segments.ts";
import { applyForceSubstitutions, type SubstitutionHit } from "./force-substitutions.ts";
import { PERSIAN_GAF } from "./persian-gaf.ts";
import { PuaGlyphAllocator } from "./pua-allocator.ts";
import { FONT3_EM, scaleFont3Advance, scaleFont3Coordinate } from "./scale.ts";

export type GameTextProfile = {
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly minimumSize?: number;
};

export type GameTextRequest = {
  readonly id: string;
  readonly text: string;
  readonly profile: GameTextProfile;
};

export type EncodedGameLabel = {
  readonly id: string;
  readonly logical: string;
  readonly encoded: string;
  readonly layout: LayoutResult;
  readonly widths: number[];
  readonly tokens: readonly string[];
  readonly gafCount: number;
  readonly boxFit: boolean;
};

export type GameTextPlan = {
  readonly glyphs: readonly Font3AppendedGlyph[];
  readonly labels: readonly EncodedGameLabel[];
  readonly gafSubstitutions: readonly SubstitutionHit[];
  readonly substitutions: readonly SubstitutionHit[];
};

function encodeRun(
  allocator: PuaGlyphAllocator,
  engine: LayoutEngine,
  run: Run,
): { readonly encoded: string; readonly scaledAdvance: number } {
  const scale = allocator.scaleFactor;
  if (run.tokenRaw !== undefined) {
    return { encoded: run.tokenRaw, scaledAdvance: scaleFont3Coordinate(run.reservedAdvance ?? 0, scale) };
  }
  const shaper = engine.getShaper();
  if (run.direction === "spacer") {
    const gap = shaper.shape(" ", "ltr").advance() * run.text.length;
    return { encoded: gap === 0 ? "" : allocator.space(gap), scaledAdvance: gap === 0 ? 0 : scaleFont3Advance(gap, scale) };
  }
  if (run.reservedAdvance !== undefined) {
    return { encoded: "", scaledAdvance: scaleFont3Coordinate(run.reservedAdvance, scale) };
  }
  const shaped = shaper.shape(run.text, run.direction);
  let encoded = "";
  let scaledAdvance = 0;
  for (const glyph of shaped.glyphs) {
    encoded += allocator.glyph(shaper, glyph.glyphId, glyph.xOffset, glyph.yOffset, glyph.xAdvance);
    scaledAdvance += scaleFont3Advance(glyph.xAdvance, scale);
  }
  return { encoded, scaledAdvance };
}

function encodeLine(
  allocator: PuaGlyphAllocator,
  engine: LayoutEngine,
  runs: readonly Run[],
  profile: GameTextProfile,
  id: string,
): { readonly encoded: string; readonly width: number } {
  let encoded = "";
  let scaledAdvance = 0;
  for (const run of runs) {
    const part = encodeRun(allocator, engine, run);
    encoded += part.encoded;
    scaledAdvance += part.scaledAdvance;
  }
  const width = scaledAdvance / FONT3_EM * profile.fontSize;
  if (width > profile.width + 0.5) {
    throw new PatchError("LIMIT", `Encoded game text ${id} exceeds width ${profile.width}`);
  }
  return { encoded, width };
}

export function planPuaGameText(
  engine: LayoutEngine,
  requests: readonly GameTextRequest[],
  firstCode: number,
): GameTextPlan {
  const allocator = new PuaGlyphAllocator(engine.getShaper(), firstCode);
  const ids = new Set<string>();
  const labels: EncodedGameLabel[] = [];
  const substitutions: SubstitutionHit[] = [];
  const shaper = engine.getShaper();

  for (const request of requests) {
    if (ids.has(request.id)) {
      throw new PatchError("VALIDATION", `Duplicate game text ${request.id}`);
    }
    ids.add(request.id);
    const unescaped = unescapeCorpusText(request.text);
    const withGaf = applyForceSubstitutions(request.id, unescaped, substitutions);
    if (withGaf.length === 0) {
      throw new PatchError("VALIDATION", `Game text ${request.id} is empty`);
    }
    const prepared = prepareGameSegments(withGaf, shaper);
    const layout = engine.layoutPrepared(prepared.paragraphs, prepared.diagnostics, {
      width: request.profile.width,
      height: request.profile.height,
      fontSize: request.profile.fontSize,
      minimumSize: request.profile.minimumSize ?? request.profile.fontSize,
      alignment: "left",
      baseDirection: "rtl",
    });
    const widths: number[] = [];
    const lines = layout.lines.map((line) => {
      const encoded = encodeLine(allocator, engine, line.runs, request.profile, request.id);
      widths.push(encoded.width);
      return encoded.encoded;
    });
    labels.push({
      id: request.id,
      logical: withGaf,
      encoded: lines.join("\n"),
      layout,
      widths,
      tokens: prepared.tokens.map((token) => token.raw),
      gafCount: substitutions.find((row) => row.id === request.id && row.from === PERSIAN_GAF)?.count ?? 0,
      boxFit: layout.totalHeight <= request.profile.height + 0.5,
    });
  }

  return {
    glyphs: allocator.glyphs,
    labels,
    gafSubstitutions: substitutions.filter((row) => row.from === PERSIAN_GAF),
    substitutions,
  };
}

export class GameTextPlanner {
  private readonly allocator: PuaGlyphAllocator;
  private readonly ids = new Set<string>();
  readonly substitutions: SubstitutionHit[] = [];

  get gafSubstitutions(): readonly SubstitutionHit[] {
    return this.substitutions.filter((row) => row.from === PERSIAN_GAF);
  }

  constructor(
    private readonly engine: LayoutEngine,
    firstCode: number,
  ) {
    this.allocator = new PuaGlyphAllocator(engine.getShaper(), firstCode);
  }

  get glyphs(): readonly Font3AppendedGlyph[] {
    return this.allocator.glyphs;
  }

  encode(request: GameTextRequest, fallback?: GameTextProfile): EncodedGameLabel {
    if (this.ids.has(request.id)) {
      throw new PatchError("VALIDATION", `Duplicate game text ${request.id}`);
    }
    this.ids.add(request.id);
    const unescaped = unescapeCorpusText(request.text);
    const withGaf = applyForceSubstitutions(request.id, unescaped, this.substitutions);
    if (withGaf.length === 0) {
      throw new PatchError("VALIDATION", `Game text ${request.id} is empty`);
    }
    try {
      return this.encodePrepared(request.id, withGaf, request.profile, true);
    } catch (error) {
      if (fallback === undefined || !(error instanceof LayoutOverflowError || error instanceof PatchError)) {
        throw error;
      }
      return this.encodePrepared(request.id, withGaf, fallback, false);
    }
  }

  private encodePrepared(
    id: string,
    text: string,
    profile: GameTextProfile,
    boxFit: boolean,
  ): EncodedGameLabel {
    const prepared = prepareGameSegments(text, this.engine.getShaper());
    const layout = this.engine.layoutPrepared(prepared.paragraphs, prepared.diagnostics, {
      width: profile.width,
      height: profile.height,
      fontSize: profile.fontSize,
      minimumSize: profile.minimumSize ?? profile.fontSize,
      alignment: "left",
      baseDirection: "rtl",
    });
    const widths: number[] = [];
    const lines = layout.lines.map((line) => {
      const encoded = encodeLine(this.allocator, this.engine, line.runs, profile, id);
      widths.push(encoded.width);
      return encoded.encoded;
    });
    return {
      id,
      logical: text,
      encoded: lines.join("\n"),
      layout,
      widths,
      tokens: prepared.tokens.map((token) => token.raw),
      gafCount: this.substitutions.find((row) => row.id === id && row.from === PERSIAN_GAF)?.count ?? 0,
      boxFit: boxFit && layout.totalHeight <= profile.height + 0.5,
    };
  }
}
