import { RenderingError } from "../errors.ts";
import type { BaseDirection, EncodedSpan, Line, OutlineCommand, Run } from "../types.ts";
import type { Shaper } from "../font/shaper.ts";
import { appendOutline, composeOutline, translatedOutline } from "../font/outline.ts";
import { visualRuns } from "./bidi-runs.ts";
import type { PuaAllocator } from "./pua.ts";
import { decodeUtf8, encodeUtf8 } from "../unicode/utf8.ts";

const UINT16_MAX = 65535;
const INT16_MIN = -32768;
const INT16_MAX = 32767;

export function fitsGlyph(shaper: Shaper, run: Run): boolean {
  if (run.direction === "spacer" || run.reservedAdvance !== undefined) return true;

  const shaped = shaper.shape(run.text, run.direction);
  const bounds = composeOutline(shaper, shaped).bounds;
  const advance = shaped.advance();
  const right = advance - (bounds.empty ? 0 : bounds.xMax);

  return (
    advance >= 0 &&
    advance <= UINT16_MAX &&
    right >= INT16_MIN &&
    right <= INT16_MAX &&
    (bounds.empty ||
      (bounds.xMin >= INT16_MIN &&
        bounds.xMin <= INT16_MAX &&
        bounds.xMax >= INT16_MIN &&
        bounds.xMax <= INT16_MAX))
  );
}

function outlineCommandsEqual(
  a: readonly OutlineCommand[],
  b: readonly OutlineCommand[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const ca = a[i];
    const cb = b[i];
    if (!ca || !cb) return false;
    if (ca.op !== cb.op) return false;
    if (ca.a.x !== cb.a.x || ca.a.y !== cb.a.y) return false;
    if (ca.op === "cubic") {
      if (ca.b?.x !== cb.b?.x || ca.b?.y !== cb.b?.y) return false;
      if (ca.c?.x !== cb.c?.x || ca.c?.y !== cb.c?.y) return false;
    }
    if (ca.op === "quad") {
      if (ca.b?.x !== cb.b?.x || ca.b?.y !== cb.b?.y) return false;
    }
  }
  return true;
}

function equivalent(
  shaper: Shaper,
  whole: Run,
  left: Run,
  right: Run,
): boolean {
  const full = shaper.shape(whole.text, whole.direction);
  const first = shaper.shape(
    whole.direction === "rtl" ? right.text : left.text,
    whole.direction,
  );
  const second = shaper.shape(
    whole.direction === "rtl" ? left.text : right.text,
    whole.direction,
  );

  if (first.advance() + second.advance() !== full.advance()) return false;

  let outline = composeOutline(shaper, first);
  const secondOutline = translatedOutline(composeOutline(shaper, second), first.advance(), 0);
  outline = appendOutline(outline, secondOutline);

  const fullOutline = composeOutline(shaper, full);
  return outlineCommandsEqual(outline.commands, fullOutline.commands);
}

export function splitGlyphWord(shaper: Shaper, run: Run): Run[] {
  if (fitsGlyph(shaper, run)) {
    return [run];
  }

  const chars = decodeUtf8(run.text);
  for (let index = 1; index < chars.length; index += 1) {
    const cut = ((Math.floor(chars.length / 2) + index - 1) % (chars.length - 1)) + 1;

    for (const joined of [false, true]) {
      let leftText = "";
      let rightText = "";

      for (let i = 0; i < cut; i += 1) {
        const cp = chars[i];
        if (cp !== undefined) leftText += encodeUtf8(cp);
      }
      for (let i = cut; i < chars.length; i += 1) {
        const cp = chars[i];
        if (cp !== undefined) rightText += encodeUtf8(cp);
      }

      if (joined) {
        leftText += encodeUtf8(0x200d);
        rightText = encodeUtf8(0x200d) + rightText;
      }

      const left: Run = { text: leftText, styles: run.styles, direction: run.direction };
      const right: Run = { text: rightText, styles: run.styles, direction: run.direction };

      if (!equivalent(shaper, run, left, right)) continue;

      const wholeAdvance = shaper.shape(run.text, run.direction).advance();
      if (
        shaper.shape(left.text, left.direction).advance() >= wholeAdvance ||
        shaper.shape(right.text, right.direction).advance() >= wholeAdvance
      ) {
        continue;
      }

      const parts = splitGlyphWord(shaper, left);
      const rest = splitGlyphWord(shaper, right);
      return [...parts, ...rest];
    }
  }

  throw new RenderingError(
    "layout: cannot split oversized word without changing its outline",
    "CANNOT_SPLIT_OVERSIZED_WORD",
  );
}

function emitSpan(out: EncodedSpan[], run: Run, allocator: PuaAllocator): void {
  let text = "";
  if (run.direction === "spacer") {
    const cp = allocator.spacer().codepoint;
    for (let i = 0; i < run.text.length; i += 1) {
      text += encodeUtf8(cp);
    }
  } else {
    const cp = allocator.getOrAllocate(run.text, run.direction).codepoint;
    text += encodeUtf8(cp);
  }

  out.push({
    styles: run.styles,
    text,
  });
}

export function encodeRun(
  run: Run,
  allocator: PuaAllocator,
  shaper: Shaper,
): EncodedSpan[] {
  const out: EncodedSpan[] = [];
  if (fitsGlyph(shaper, run)) {
    emitSpan(out, run, allocator);
    return out;
  }

  const parts: Run[] = [];
  let width = 0;

  for (let start = 0; start < run.text.length; ) {
    const isSpace = run.text[start] === " ";
    let end = start + 1;
    while (end < run.text.length && (run.text[end] === " ") === isSpace) {
      end += 1;
    }

    const partText = run.text.slice(start, end);
    const part: Run = {
      text: partText,
      styles: run.styles,
      direction: isSpace ? "spacer" : run.direction,
    };

    const pieces = splitGlyphWord(shaper, part);
    width += shaper.shape(part.text, isSpace ? "ltr" : part.direction).advance();
    parts.push(...pieces);
    start = end;
  }

  if (width !== shaper.shape(run.text, run.direction).advance()) {
    throw new RenderingError(
      "layout: word splitting changes shaped spacing",
      "WORD_SPLITTING_CHANGED_SPACING",
    );
  }

  if (run.direction === "rtl") {
    parts.reverse();
  }

  for (const part of parts) {
    emitSpan(out, part, allocator);
  }

  return out;
}

export function encodeLines(
  lines: readonly Line[],
  allocator: PuaAllocator,
  shaper: Shaper,
  baseDirection: BaseDirection = "rtl",
): EncodedSpan[] {
  const family = shaper.family();
  if (family !== "Ara" && family !== "Force") {
    throw new RenderingError(
      `layout requires the Ara or Force font, found ${family}`,
      "INVALID_FONT_FAMILY",
    );
  }

  allocator.spacer();
  const output: EncodedSpan[] = [];

  for (const line of lines) {
    for (const run of visualRuns(line.chars, baseDirection)) {
      if (run.reservedAdvance !== undefined) {
        continue;
      }
      const spans = encodeRun(run, allocator, shaper);
      output.push(...spans);
    }
    if (line.newline) {
      output.push({ styles: line.breakStyles, text: "\n" });
    }
  }

  return output;
}
