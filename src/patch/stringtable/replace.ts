import { decodeStringTable } from "../../resources/stringtable/decode.ts";
import { PatchError } from "../errors.ts";
import { decodeBuddhaQuoted, decodeBuddhaUnquoted, encodeBuddhaQuoted } from "./escape.ts";

export type StringTableReplacement = {
  readonly lineCode: string;
  readonly text: string;
};

export type TextSpan = {
  readonly lineCode: string;
  readonly start: number;
  readonly end: number;
  readonly quoted: boolean;
  readonly original: string;
};

export type StringTableReplaceResult = {
  readonly bytes: Uint8Array;
  readonly replaced: readonly {
    readonly lineCode: string;
    readonly original: string;
    readonly text: string;
    readonly start: number;
    readonly originalLength: number;
    readonly newLength: number;
  }[];
};

function writeU32Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

export function locateStringTableTextSpans(bytes: Uint8Array): readonly TextSpan[] {
  const decoded = decodeStringTable(bytes);
  const spans: TextSpan[] = [];
  for (const record of decoded.records) {
    if (record.textOffset === undefined) {
      throw new PatchError("RESOURCE", `StringTable ${record.lineCode} has no Text byte offset`);
    }
    const quoted = bytes[record.textOffset] === 0x22;
    const parsed = quoted
      ? decodeBuddhaQuoted(bytes, record.textOffset)
      : decodeBuddhaUnquoted(bytes, record.textOffset);
    if (parsed.text !== record.text) {
      throw new PatchError(
        "RESOURCE",
        `StringTable ${record.lineCode} span text does not match decoder (${JSON.stringify(parsed.text)} vs ${JSON.stringify(record.text)})`,
      );
    }
    spans.push({
      lineCode: record.lineCode,
      start: record.textOffset,
      end: parsed.end,
      quoted,
      original: record.text,
    });
  }
  return spans;
}

export function replaceStringTableTexts(
  bytes: Uint8Array,
  replacements: readonly StringTableReplacement[],
): StringTableReplaceResult {
  if (bytes.length < 4) {
    throw new PatchError("RESOURCE", "StringTable is shorter than the size prefix");
  }
  const unique = new Map<string, string>();
  for (const replacement of replacements) {
    if (replacement.lineCode.length === 0) {
      throw new PatchError("VALIDATION", "Replacement line code is empty");
    }
    if (unique.has(replacement.lineCode)) {
      throw new PatchError("VALIDATION", `Duplicate replacement for ${replacement.lineCode}`);
    }
    unique.set(replacement.lineCode, replacement.text);
  }

  const spans = locateStringTableTextSpans(bytes);
  const byCode = new Map(spans.map((span) => [span.lineCode, span]));
  const applied: {
    lineCode: string;
    original: string;
    text: string;
    start: number;
    originalLength: number;
    newLength: number;
  }[] = [];
  const ordered: { readonly span: TextSpan; readonly text: string }[] = [];
  for (const [lineCode, text] of unique) {
    const span = byCode.get(lineCode);
    if (span === undefined) {
      throw new PatchError("RESOURCE", `StringTable has no Text record ${lineCode}`);
    }
    ordered.push({ span, text });
  }
  ordered.sort((left, right) => left.span.start - right.span.start);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (current.span.start < previous.span.end) {
      throw new PatchError("RESOURCE", `StringTable text spans overlap at ${current.span.lineCode}`);
    }
  }

  const parts: Uint8Array[] = [];
  let cursor = 0;
  let total = 0;
  for (const item of ordered) {
    const head = bytes.subarray(cursor, item.span.start);
    const encoded = encodeBuddhaQuoted(item.text);
    parts.push(head, encoded);
    total += head.length + encoded.length;
    applied.push({
      lineCode: item.span.lineCode,
      original: item.span.original,
      text: item.text,
      start: item.span.start,
      originalLength: item.span.end - item.span.start,
      newLength: encoded.length,
    });
    cursor = item.span.end;
  }
  const tail = bytes.subarray(cursor);
  parts.push(tail);
  total += tail.length;
  const current = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    current.set(part, offset);
    offset += part.length;
  }

  if (current.length < 4) {
    throw new PatchError("RESOURCE", "Replacement produced a truncated StringTable");
  }
  const declared = current.length - 4;
  if (declared > 0xffffffff) {
    throw new PatchError("LIMIT", `StringTable body ${declared} exceeds the 32-bit size prefix`);
  }
  writeU32Le(current, 0, declared);

  const decoded = decodeStringTable(current);
  const expected = new Map(decoded.records.map((record) => [record.lineCode, record.text]));
  for (const item of applied) {
    if (expected.get(item.lineCode) !== item.text) {
      throw new PatchError(
        "RESOURCE",
        `Replacement for ${item.lineCode} did not round-trip through the StringTable decoder`,
      );
    }
  }
  for (const record of decoded.records) {
    if (unique.has(record.lineCode)) {
      continue;
    }
    const original = byCode.get(record.lineCode);
    if (original === undefined || original.original !== record.text) {
      throw new PatchError("RESOURCE", `Replacement mutated untouched StringTable record ${record.lineCode}`);
    }
  }
  if (decoded.records.length !== spans.length) {
    throw new PatchError("RESOURCE", "Replacement changed the StringTable record count");
  }

  return { bytes: current, replaced: applied };
}
