import { readFile } from "node:fs/promises";
import { TranslationError } from "../../errors.ts";
import type { CorpusItem, CorpusSourceMapping } from "../../corpus/types.ts";
import { isRecord } from "../../unknown.ts";

export async function loadExtractedStringTableCorpus(filePath: string): Promise<CorpusItem[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreadable file";
    throw new TranslationError("VALIDATION", `Cannot read translation input: ${message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TranslationError("VALIDATION", "Translation input is not valid JSON");
  }
  return mapExtractedStringTableRecords(parsed);
}

export function mapExtractedStringTableRecords(value: unknown): CorpusItem[] {
  if (!Array.isArray(value)) {
    throw new TranslationError("VALIDATION", "Translation input must be a JSON array of extracted records");
  }
  const items: CorpusItem[] = [];
  for (const [index, row] of value.entries()) {
    const mapped = mapExtractedRecord(row, index);
    if (mapped !== undefined) {
      items.push(mapped);
    }
  }
  if (items.length === 0) {
    throw new TranslationError("VALIDATION", "Translation input has no StringTable records with text");
  }
  return items;
}

function mapExtractedRecord(row: unknown, index: number): CorpusItem | undefined {
  if (!isRecord(row)) {
    throw new TranslationError("VALIDATION", `Extracted record ${index} must be an object`);
  }
  const entryType = optionalString(row.entryType, `entryType at ${index}`);
  if (entryType !== "StringTable") {
    return undefined;
  }
  const recordId = requiredString(row.recordId, `recordId at ${index}`);
  const text = row.text;
  if (typeof text !== "string") {
    throw new TranslationError("VALIDATION", `StringTable record ${recordId} is missing text`);
  }
  const source: CorpusSourceMapping = {
    archiveHeader: requiredString(row.archiveHeader, `archiveHeader at ${index}`),
    archivePayload: optionalString(row.archivePayload, `archivePayload at ${index}`),
    entryName: requiredString(row.entryName, `entryName at ${index}`),
    entryType,
    entryIndex: requiredInt(row.entryIndex, `entryIndex at ${index}`),
    payloadOffset: optionalInt(row.payloadOffset, `payloadOffset at ${index}`),
    storedSize: optionalInt(row.storedSize, `storedSize at ${index}`),
    contentSize: optionalInt(row.contentSize, `contentSize at ${index}`),
    recordId,
    sourceByteOffset: optionalInt(row.sourceByteOffset, `sourceByteOffset at ${index}`),
    extra: readExtra(row.extra, index),
  };
  const context = optionalString(row.context, `context at ${index}`);
  return { id: recordId, text, source, ...(context === undefined ? {} : { context }) };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TranslationError("VALIDATION", `Extracted record ${label} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new TranslationError("VALIDATION", `Extracted record ${label} must be a string`);
  }
  return value;
}

function requiredInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TranslationError("VALIDATION", `Extracted record ${label} must be an integer`);
  }
  return value;
}

function optionalInt(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requiredInt(value, label);
}

function readExtra(value: unknown, index: number): Readonly<Record<string, string | number | undefined>> {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    throw new TranslationError("VALIDATION", `Extracted record extra at ${index} must be an object`);
  }
  const extra: Record<string, string | number | undefined> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || typeof entry === "string" || typeof entry === "number") {
      extra[key] = entry;
      continue;
    }
    throw new TranslationError(
      "VALIDATION",
      `Extracted record extra.${key} at ${index} must be a string or number`,
    );
  }
  return extra;
}
