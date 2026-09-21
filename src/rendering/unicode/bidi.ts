import bidiFactory from "bidi-js";
import { RenderingError } from "../errors.ts";
import type { BaseDirection, VisualToken } from "../types.ts";

const bidi = bidiFactory();

type TokenRange = {
  readonly start: number;
  readonly length: number;
};

type PositionedToken = {
  readonly token: VisualToken;
  readonly visualPosition: number;
};

export function logicalDirectionalRuns(
  text: string,
  baseDirection?: BaseDirection,
): readonly VisualToken[] {
  if (text.length === 0) {
    return [];
  }

  const embedding = bidi.getEmbeddingLevels(text, baseDirection);
  const levels = embedding.levels;
  const runs: VisualToken[] = [];

  let start = 0;
  while (start < text.length) {
    let end = start + 1;
    const startLevel = levels[start] ?? 0;
    const rtl = (startLevel & 1) !== 0;

    while (end < text.length) {
      const currentLevel = levels[end] ?? 0;
      if (((currentLevel & 1) !== 0) !== rtl) {
        break;
      }
      end += 1;
    }

    runs.push({
      text: text.slice(start, end),
      direction: rtl ? "rtl" : "ltr",
    });

    start = end;
  }

  return runs;
}

export function visualOrder(
  logicalTokens: readonly string[],
  baseDirection: BaseDirection = "rtl",
): readonly VisualToken[] {
  if (logicalTokens.length === 0) {
    return [];
  }

  let text = "";
  const tokenRanges: TokenRange[] = [];
  const spacers: number[] = [];

  for (let i = 0; i < logicalTokens.length; i += 1) {
    const token = logicalTokens[i];
    if (token === undefined || token.length === 0) {
      throw new RenderingError("cannot reorder an empty token", "EMPTY_TOKEN");
    }

    const start = text.length;
    text += token;
    tokenRanges.push({ start, length: token.length });

    if (i + 1 < logicalTokens.length) {
      spacers.push(text.length);
      text += " ";
    }
  }

  const embedding = bidi.getEmbeddingLevels(text, baseDirection);
  const levels = embedding.levels;
  const visualToLogical = bidi.getReorderedIndices(text, embedding);

  const logicalToVisual = new Int32Array(text.length);
  for (let v = 0; v < visualToLogical.length; v += 1) {
    const logicalIdx = visualToLogical[v];
    if (logicalIdx !== undefined) {
      logicalToVisual[logicalIdx] = v;
    }
  }

  function firstVisualPosition(start: number, length: number): number {
    let first = Number.MAX_SAFE_INTEGER;
    for (let i = start; i < start + length; i += 1) {
      const pos = logicalToVisual[i];
      if (pos !== undefined && pos < first) {
        first = pos;
      }
    }
    return first;
  }

  const positioned: PositionedToken[] = [];

  for (const token of tokenRanges) {
    let runStart = token.start;
    const tokenEnd = token.start + token.length;

    while (runStart < tokenEnd) {
      let runEnd = runStart + 1;
      const startLevel = levels[runStart] ?? 0;

      while (runEnd < tokenEnd && (levels[runEnd] ?? 0) === startLevel) {
        runEnd += 1;
      }

      const rtl = (startLevel & 1) !== 0;
      const runLen = runEnd - runStart;

      positioned.push({
        token: {
          text: text.slice(runStart, runEnd),
          direction: rtl ? "rtl" : "ltr",
        },
        visualPosition: firstVisualPosition(runStart, runLen),
      });

      runStart = runEnd;
    }
  }

  for (const spacer of spacers) {
    positioned.push({
      token: {
        text: "",
        direction: "spacer",
      },
      visualPosition: firstVisualPosition(spacer, 1),
    });
  }

  // Stable sort by visual position
  positioned.sort((a, b) => a.visualPosition - b.visualPosition);

  return positioned.map((p) => p.token);
}

export function resolveEmbeddingLevels(
  text: string,
  baseDirection?: BaseDirection,
): { readonly levels: Uint8Array; readonly visualToLogical: Uint32Array } {
  const embedding = bidi.getEmbeddingLevels(text, baseDirection);
  const visualToLogical = bidi.getReorderedIndices(text, embedding);
  return {
    levels: embedding.levels,
    visualToLogical: new Uint32Array(visualToLogical),
  };
}
