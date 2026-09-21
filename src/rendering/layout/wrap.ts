import { LayoutOverflowError, RenderingError } from "../errors.ts";
import type { BaseDirection, Line } from "../types.ts";
import type { Shaper } from "../font/shaper.ts";
import { visualOrder } from "../unicode/bidi.ts";
import { encodeUtf8 } from "../unicode/utf8.ts";
import { measureLineAdvance, measureVisualTokens } from "./measure.ts";

function checkTokenFits(
  shaper: Shaper,
  token: string,
  width: number,
  baseDirection: BaseDirection,
): void {
  const runs = visualOrder([token], baseDirection);
  for (const run of runs) {
    if (run.direction !== "spacer") {
      const shaped = shaper.shape(run.text, run.direction);
      if (shaped.advance() > width) {
        throw new LayoutOverflowError("wrap overflow: directional run exceeds source width");
      }
    }
  }

  if (measureVisualTokens(shaper, runs) > width) {
    throw new LayoutOverflowError("wrap overflow: token exceeds source width");
  }
}

export function wrapLogicalTokens(
  shaper: Shaper,
  tokens: readonly string[],
  width: number,
  baseDirection: BaseDirection = "rtl",
): string[][] {
  if (width <= 0) {
    throw new RenderingError("source line has no measurable width", "INVALID_WIDTH");
  }

  const lines: string[][] = [];
  let current: string[] = [];

  for (const token of tokens) {
    checkTokenFits(shaper, token, width, baseDirection);

    const candidate = [...current, token];
    if (
      current.length > 0 &&
      measureVisualTokens(shaper, visualOrder(candidate, baseDirection)) > width
    ) {
      lines.push(current);
      current = [];
    }
    current.push(token);
  }

  if (current.length > 0) {
    lines.push(current);
  }

  for (const line of lines) {
    if (measureVisualTokens(shaper, visualOrder(line, baseDirection)) > width) {
      throw new LayoutOverflowError("wrap overflow: emitted line exceeds source width");
    }
  }

  return lines;
}

type Word = {
  readonly begin: number;
  readonly end: number;
};

function sliceLine(source: Line, begin: number, end: number): Line {
  const chars = source.chars.slice(begin, end);
  const softBreak = end !== source.chars.length;
  const newline = softBreak || source.newline;
  const breakChar = source.chars[end];
  const breakStyles = softBreak
    ? breakChar
      ? breakChar.styles
      : (source.chars[end - 1]?.styles ?? source.breakStyles)
    : source.breakStyles;

  return {
    chars,
    breakStyles,
    newline,
  };
}

function wrapWordsByMeasure(
  shaper: Shaper,
  source: Line,
  words: readonly Word[],
  width: number,
  out: Line[],
  baseDirection: BaseDirection,
): void {
  let wordBegin = 0;

  while (wordBegin < words.length) {
    const first = wordBegin === 0 ? 0 : (words[wordBegin]?.begin ?? 0);

    const charEndFor = (wordEndExclusive: number): number => {
      if (wordEndExclusive === words.length) return source.chars.length;
      const prev = words[wordEndExclusive - 1];
      return prev ? prev.end : source.chars.length;
    };

    let wordEnd = wordBegin + 1;
    let candidate = sliceLine(source, first, charEndFor(wordEnd));

    if (measureLineAdvance(shaper, candidate.chars, baseDirection) > width) {
      throw new LayoutOverflowError("layout: styled word exceeds width");
    }

    while (wordEnd < words.length) {
      const next = sliceLine(source, first, charEndFor(wordEnd + 1));
      if (measureLineAdvance(shaper, next.chars, baseDirection) > width) {
        break;
      }
      wordEnd += 1;
      candidate = next;
    }

    out.push(candidate);
    wordBegin = wordEnd;
  }
}

function wrapParagraph(
  shaper: Shaper,
  source: Line,
  width: number,
  out: Line[],
  baseDirection: BaseDirection,
): void {
  if (measureLineAdvance(shaper, source.chars, baseDirection) <= width) {
    out.push(source);
    return;
  }

  const allSpaces = source.chars.every((ch) => ch.codepoint === 0x0020);
  if (allSpaces) {
    if (measureLineAdvance(shaper, source.chars, baseDirection) > width) {
      throw new LayoutOverflowError("layout: whitespace-only line exceeds width");
    }
    out.push(source);
    return;
  }

  const words: Word[] = [];
  const tokens: string[] = [];

  for (let begin = 0; begin < source.chars.length; ) {
    while (
      begin < source.chars.length &&
      source.chars[begin]?.codepoint === 0x0020 &&
      source.chars[begin]?.reservedAdvance === undefined
    ) {
      begin += 1;
    }
    if (begin === source.chars.length) break;

    const reserved = source.chars[begin];
    if (reserved?.reservedAdvance !== undefined) {
      words.push({ begin, end: begin + 1 });
      begin += 1;
      continue;
    }

    let end = begin;
    let token = "";
    while (
      end < source.chars.length &&
      source.chars[end]?.codepoint !== 0x0020 &&
      source.chars[end]?.reservedAdvance === undefined
    ) {
      const ch = source.chars[end];
      if (ch) {
        token += encodeUtf8(ch.codepoint);
      }
      end += 1;
    }

    words.push({ begin, end });
    tokens.push(token);
    begin = end;
  }

  if (source.chars.some((ch) => ch.reservedAdvance !== undefined)) {
    wrapWordsByMeasure(shaper, source, words, width, out, baseDirection);
    return;
  }

  const proposed = wrapLogicalTokens(shaper, tokens, width, baseDirection);
  let begin = 0;

  for (const proposal of proposed) {
    const limit = begin + proposal.length;
    while (begin < limit) {
      let end = limit;

      const first = begin === 0 ? 0 : (words[begin]?.begin ?? 0);
      const getCandidateEnd = (e: number): number => {
        if (e === words.length) return source.chars.length;
        const prevWord = words[e - 1];
        return prevWord ? prevWord.end : source.chars.length;
      };

      let candidate = sliceLine(source, first, getCandidateEnd(end));
      while (measureLineAdvance(shaper, candidate.chars, baseDirection) > width) {
        end -= 1;
        if (end === begin) {
          throw new LayoutOverflowError("layout: styled word exceeds width");
        }
        candidate = sliceLine(source, first, getCandidateEnd(end));
      }

      out.push(candidate);
      begin = end;
    }
  }
}

export function wrapLines(
  shaper: Shaper,
  paragraphs: readonly Line[],
  width: number,
  baseDirection: BaseDirection = "rtl",
): Line[] {
  if (width <= 0) {
    throw new RenderingError("layout: width must be positive font units", "INVALID_WIDTH");
  }

  const lines: Line[] = [];
  for (const paragraph of paragraphs) {
    wrapParagraph(shaper, paragraph, width, lines, baseDirection);
  }
  return lines;
}
