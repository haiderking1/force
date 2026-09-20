import {
  MAX_STRING_CHARS,
  MAX_STRING_RUNS,
  MIN_BINARY_RUN_CHARS,
  MIN_LETTER_RATIO,
  MIN_UTF16_UNITS,
} from "./bounds.ts";
import type { OffsetSpace, StringEncoding, StringRun } from "./types.ts";

export type StringScanMode = "text" | "binary";

function isAsciiPrintable(value: number): boolean {
  return value >= 0x20 && value <= 0x7e;
}

function isPrintableCodePoint(code: number): boolean {
  if (code >= 0x20 && code <= 0x7e) {
    return true;
  }
  if (code < 0x20 || code === 0x7f) {
    return false;
  }
  if (code >= 0x80 && code <= 0x9f) {
    return false;
  }
  if (code >= 0xd800 && code <= 0xdfff) {
    return false;
  }
  if (code === 0xfffd || code === 0xfffe || code === 0xffff) {
    return false;
  }
  return code <= 0x10ffff;
}

function isTextCodePoint(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0d || isPrintableCodePoint(code);
}

function decodeUtf8At(bytes: Uint8Array, index: number): { code: number; size: number } | undefined {
  const lead = bytes[index];
  if (lead === undefined) {
    return undefined;
  }
  if (lead <= 0x7f) {
    return { code: lead, size: 1 };
  }
  if ((lead & 0xe0) === 0xc0 && lead >= 0xc2 && index + 1 < bytes.length) {
    const next = bytes[index + 1];
    if (next !== undefined && (next & 0xc0) === 0x80) {
      const code = ((lead & 0x1f) << 6) | (next & 0x3f);
      if (code >= 0x80) {
        return { code, size: 2 };
      }
    }
    return undefined;
  }
  if ((lead & 0xf0) === 0xe0 && index + 2 < bytes.length) {
    const one = bytes[index + 1];
    const two = bytes[index + 2];
    if (one !== undefined && two !== undefined && (one & 0xc0) === 0x80 && (two & 0xc0) === 0x80) {
      const code = ((lead & 0x0f) << 12) | ((one & 0x3f) << 6) | (two & 0x3f);
      if (code >= 0x800 && !(code >= 0xd800 && code <= 0xdfff)) {
        return { code, size: 3 };
      }
    }
    return undefined;
  }
  if ((lead & 0xf8) === 0xf0 && lead <= 0xf4 && index + 3 < bytes.length) {
    const one = bytes[index + 1];
    const two = bytes[index + 2];
    const three = bytes[index + 3];
    if (
      one !== undefined &&
      two !== undefined &&
      three !== undefined &&
      (one & 0xc0) === 0x80 &&
      (two & 0xc0) === 0x80 &&
      (three & 0xc0) === 0x80
    ) {
      const code = ((lead & 0x07) << 18) | ((one & 0x3f) << 12) | ((two & 0x3f) << 6) | (three & 0x3f);
      if (code >= 0x10000 && code <= 0x10ffff) {
        return { code, size: 4 };
      }
    }
  }
  return undefined;
}

function letterRatio(text: string): number {
  const chars = [...text].filter((char) => char !== "\n" && char !== "\r" && char !== "\t");
  if (chars.length === 0) {
    return 0;
  }
  let letters = 0;
  for (const char of chars) {
    if (/\p{L}/u.test(char)) {
      letters += 1;
    }
  }
  return letters / chars.length;
}

function clipText(text: string): string {
  const chars = [...text];
  if (chars.length <= MAX_STRING_CHARS) {
    return text;
  }
  return chars.slice(0, MAX_STRING_CHARS).join("");
}

function keepRun(text: string, mode: StringScanMode, minChars: number): boolean {
  const chars = [...text].filter((char) => char !== "\n" && char !== "\r" && char !== "\t");
  if (chars.length < minChars) {
    return false;
  }
  if (mode === "text") {
    return true;
  }
  return letterRatio(text) >= MIN_LETTER_RATIO;
}

function encodingOf(text: string): StringEncoding {
  return [...text].some((char) => (char.codePointAt(0) ?? 0) > 0x7f) ? "utf-8" : "ascii";
}

function pushRun(
  runs: StringRun[],
  offset: number,
  byteLength: number,
  encoding: StringEncoding,
  offsetSpace: OffsetSpace,
  text: string,
  mode: StringScanMode,
  minChars: number,
): void {
  if (runs.length >= MAX_STRING_RUNS) {
    return;
  }
  if (!keepRun(text, mode, minChars)) {
    return;
  }
  runs.push({
    offset,
    byteLength,
    encoding,
    offsetSpace,
    text: clipText(text),
  });
}

function acceptCode(code: number, mode: StringScanMode): boolean {
  return mode === "text" ? isTextCodePoint(code) : isPrintableCodePoint(code);
}

function isUtf16LeTextUnit(low: number, high: number, code: number): boolean {
  if (!isPrintableCodePoint(code)) {
    return false;
  }
  if (isAsciiPrintable(low) && isAsciiPrintable(high)) {
    return false;
  }
  return true;
}

export function extractUtf8AndAsciiRuns(
  bytes: Uint8Array,
  mode: StringScanMode,
  offsetSpace: OffsetSpace,
): StringRun[] {
  const runs: StringRun[] = [];
  let index = 0;
  while (index < bytes.length && runs.length < MAX_STRING_RUNS) {
    const first = decodeUtf8At(bytes, index);
    if (first === undefined || !acceptCode(first.code, mode)) {
      index += 1;
      continue;
    }
    const start = index;
    let text = "";
    while (index < bytes.length) {
      const next = decodeUtf8At(bytes, index);
      if (next === undefined || !acceptCode(next.code, mode)) {
        break;
      }
      text += String.fromCodePoint(next.code);
      index += next.size;
    }
    pushRun(
      runs,
      start,
      index - start,
      encodingOf(text),
      offsetSpace,
      text,
      mode,
      mode === "text" ? 1 : MIN_BINARY_RUN_CHARS,
    );
    if (index === start) {
      index += 1;
    }
  }
  return runs;
}

export function extractUtf16LeRuns(bytes: Uint8Array, offsetSpace: OffsetSpace): StringRun[] {
  const runs: StringRun[] = [];
  let index = bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : 0;
  if (index % 2 === 1) {
    index += 1;
  }
  while (index + 1 < bytes.length && runs.length < MAX_STRING_RUNS) {
    const low = bytes[index];
    const high = bytes[index + 1];
    if (low === undefined || high === undefined) {
      break;
    }
    const code = low | (high << 8);
    if (!isUtf16LeTextUnit(low, high, code)) {
      index += 2;
      continue;
    }
    const start = index;
    let text = "";
    while (index + 1 < bytes.length) {
      const unitLow = bytes[index];
      const unitHigh = bytes[index + 1];
      if (unitLow === undefined || unitHigh === undefined) {
        break;
      }
      const unit = unitLow | (unitHigh << 8);
      if (!isUtf16LeTextUnit(unitLow, unitHigh, unit)) {
        break;
      }
      text += String.fromCodePoint(unit);
      index += 2;
    }
    pushRun(runs, start, index - start, "utf-16le", offsetSpace, text, "binary", MIN_UTF16_UNITS);
    if (index === start) {
      index += 2;
    }
  }
  return runs;
}

export function extractStringRuns(
  bytes: Uint8Array,
  mode: StringScanMode,
  offsetSpace: OffsetSpace,
): StringRun[] {
  const utf8Runs = extractUtf8AndAsciiRuns(bytes, mode, offsetSpace);
  if (mode === "text") {
    return utf8Runs;
  }
  const utf16Runs = extractUtf16LeRuns(bytes, offsetSpace);
  return [...utf8Runs, ...utf16Runs].sort((left, right) => left.offset - right.offset).slice(0, MAX_STRING_RUNS);
}
