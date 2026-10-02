import bidiFactory from "bidi-js";
import { RenderingError } from "../errors.ts";
import type { BaseDirection, Character, Run } from "../types.ts";
import { encodeUtf8 } from "../unicode/utf8.ts";
import { stylesEqual } from "../unicode/categories.ts";

const bidi = bidiFactory();

type PositionedRun = {
  readonly run: Run;
  readonly position: number;
};

export function visualRuns(
  line: readonly Character[],
  baseDirection: BaseDirection = "rtl",
): readonly Run[] {
  if (line.length === 0) {
    return [];
  }

  const codepoints: number[] = [];
  for (const ch of line) {
    codepoints.push(ch.codepoint);
  }
  const text = encodeUtf8(codepoints);

  // Map each character in line to its start and end in the UTF-16 string text
  const charCodeUnitOffsets: number[] = [];
  let currentOffset = 0;
  for (const ch of line) {
    charCodeUnitOffsets.push(currentOffset);
    currentOffset += ch.codepoint > 0xffff ? 2 : 1;
  }
  charCodeUnitOffsets.push(currentOffset);

  const embedding = bidi.getEmbeddingLevels(text, baseDirection);
  const levels = embedding.levels;
  const visualToLogical = bidi.getReorderedIndices(text, embedding);

  // Map each UTF-16 code unit to its character index in line
  const codeUnitToCharIndex = new Int32Array(text.length);
  for (let i = 0; i < line.length; i += 1) {
    const start = charCodeUnitOffsets[i] ?? 0;
    const end = charCodeUnitOffsets[i + 1] ?? start;
    for (let u = start; u < end; u += 1) {
      codeUnitToCharIndex[u] = i;
    }
  }

  // Derive character-level visual order, deduplicating multi-unit surrogate pairs
  const visualCharOrder: number[] = [];
  let prevChar = -1;
  for (let v = 0; v < visualToLogical.length; v += 1) {
    const logicalCodeUnit = visualToLogical[v];
    if (logicalCodeUnit !== undefined) {
      const chIdx = codeUnitToCharIndex[logicalCodeUnit] ?? -1;
      if (chIdx !== -1 && chIdx !== prevChar) {
        visualCharOrder.push(chIdx);
        prevChar = chIdx;
      }
    }
  }

  // charPositions maps each character index in line (0..line.length - 1) to its visual position
  const charPositions = new Int32Array(line.length);
  for (let vPos = 0; vPos < visualCharOrder.length; vPos += 1) {
    const chIdx = visualCharOrder[vPos];
    if (chIdx !== undefined) {
      charPositions[chIdx] = vPos;
    }
  }

  // Get character-level bidi embedding level
  const charLevels = new Uint8Array(line.length);
  for (let i = 0; i < line.length; i += 1) {
    const codeUnitStart = charCodeUnitOffsets[i] ?? 0;
    charLevels[i] = levels[codeUnitStart] ?? (baseDirection === "rtl" ? 1 : 0);
  }

  function makeRun(begin: number, end: number, level: number): PositionedRun {
    const firstChar = line[begin];
    if (!firstChar) {
      throw new RenderingError("empty run span", "INVALID_RUN");
    }

    const rtl = (level & 1) !== 0;
    let runText = "";
    let spaces = true;
    let reservedAdvance = 0;
    let hasReserved = false;
    let tokenRaw = "";
    let first = charPositions[begin] ?? 0;
    let last = first;

    for (let i = begin; i < end; i += 1) {
      const ch = line[i];
      if (!ch) continue;
      runText += encodeUtf8(ch.codepoint);
      spaces = spaces && ch.codepoint === 0x0020 && ch.reservedAdvance === undefined;
      if (ch.reservedAdvance !== undefined) {
        hasReserved = true;
        reservedAdvance += ch.reservedAdvance;
        if (ch.tokenRaw !== undefined) {
          tokenRaw += ch.tokenRaw;
        }
      }

      const pos = charPositions[i] ?? 0;
      first = Math.min(first, pos);
      last = Math.max(last, pos);
    }

    if (first < 0 || last - first + 1 !== end - begin) {
      throw new RenderingError("layout: style run is not visually contiguous", "NON_CONTIGUOUS_RUN");
    }

    const direction = hasReserved ? "ltr" : spaces ? "spacer" : rtl ? "rtl" : "ltr";
    const run: Run = {
      text: runText,
      styles: firstChar.styles,
      direction,
      reservedAdvance: hasReserved ? reservedAdvance : undefined,
      tokenRaw: tokenRaw.length > 0 ? tokenRaw : undefined,
    };

    return { run, position: first };
  }

  const positioned: PositionedRun[] = [];
  for (let begin = 0; begin < line.length; ) {
    let end = begin + 1;
    const beginLevel = charLevels[begin] ?? (baseDirection === "rtl" ? 1 : 0);
    const beginChar = line[begin];
    if (!beginChar) break;

    const beginReserved = beginChar.reservedAdvance !== undefined;

    while (end < line.length) {
      const currChar = line[end];
      if (!currChar) break;
      const currReserved = currChar.reservedAdvance !== undefined;
      if (
        charLevels[end] !== beginLevel ||
        !stylesEqual(currChar.styles, beginChar.styles) ||
        currReserved !== beginReserved
      ) {
        break;
      }
      end += 1;
    }

    positioned.push(makeRun(begin, end, beginLevel));
    begin = end;
  }

  positioned.sort((a, b) => a.position - b.position);
  return positioned.map((p) => p.run);
}
