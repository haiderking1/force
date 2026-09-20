import { MAX_STRING_CHARS, MAX_STRING_RUNS } from "./bounds.ts";
import type { StringRun } from "./types.ts";

function clip(text: string): string {
  const chars = [...text];
  if (chars.length <= MAX_STRING_CHARS) {
    return text;
  }
  return chars.slice(0, MAX_STRING_CHARS).join("");
}

function encodingOf(text: string): "ascii" | "utf-8" {
  return [...text].some((char) => (char.codePointAt(0) ?? 0) > 0x7f) ? "utf-8" : "ascii";
}

export type TextLine = {
  readonly offset: number;
  readonly byteLength: number;
  readonly text: string;
};

export function splitUtf8Lines(bytes: Uint8Array): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  let index = 0;
  while (index <= bytes.length) {
    const value = index < bytes.length ? bytes[index] : 0x0a;
    if (index === bytes.length || value === 0x0a) {
      let end = index;
      if (end > start && bytes[end - 1] === 0x0d) {
        end -= 1;
      }
      const slice = bytes.subarray(start, end);
      lines.push({
        offset: start,
        byteLength: slice.length,
        text: new TextDecoder("utf-8").decode(slice),
      });
      index += 1;
      start = index;
      continue;
    }
    index += 1;
  }
  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.text.length === 0 && last.offset === bytes.length) {
      lines.pop();
    }
  }
  return lines;
}

export function extractTextLines(bytes: Uint8Array, interesting: readonly string[]): StringRun[] {
  const prioritized: StringRun[] = [];
  const rest: StringRun[] = [];
  for (const line of splitUtf8Lines(bytes)) {
    if (line.text.length === 0) {
      continue;
    }
    const run: StringRun = {
      offset: line.offset,
      byteLength: line.byteLength,
      encoding: encodingOf(line.text),
      offsetSpace: "file",
      text: clip(line.text),
    };
    const lower = line.text.toLowerCase();
    const hit = interesting.some((item) => lower.includes(item.toLowerCase()));
    if (hit) {
      prioritized.push(run);
    } else {
      rest.push(run);
    }
  }
  return [...prioritized, ...rest].slice(0, MAX_STRING_RUNS);
}
