import { TranslationError } from "../errors.ts";
import { isRecord } from "../unknown.ts";
import type { CheckpointIdentity, CorpusItem, CorpusSourceMapping } from "../corpus/types.ts";
import { CHECKPOINT_SCHEMA_VERSION, type StoredBatchSuccess } from "./types.ts";

export function parseStoredBatchSuccess(value: unknown): StoredBatchSuccess {
  if (!isRecord(value)) {
    throw new TranslationError("VALIDATION", "Checkpoint batch must be a JSON object");
  }
  if (value.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    throw new TranslationError("VALIDATION", "Checkpoint batch has an incompatible schema");
  }
  if (typeof value.batchIndex !== "number" || !Number.isSafeInteger(value.batchIndex) || value.batchIndex < 0) {
    throw new TranslationError("VALIDATION", "Checkpoint batch index is invalid");
  }
  if (typeof value.identityHash !== "string" || value.identityHash.length === 0) {
    throw new TranslationError("VALIDATION", "Checkpoint batch is missing identityHash");
  }
  if (!Array.isArray(value.items) || !Array.isArray(value.translations)) {
    throw new TranslationError("VALIDATION", "Checkpoint batch is missing items or translations");
  }
  const items = value.items.map((row, index) => readSourceItem(row, `items[${index}]`));
  const translations = value.translations.map((row, index) => readTranslationItem(row, `translations[${index}]`));
  return {
    schemaVersion: 1,
    batchIndex: value.batchIndex,
    identityHash: value.identityHash,
    items,
    translations,
  };
}

export function parseCheckpointIdentity(value: unknown): CheckpointIdentity {
  if (!isRecord(value)) {
    throw new TranslationError("VALIDATION", "Checkpoint identity must be a JSON object");
  }
  if (value.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    throw new TranslationError("VALIDATION", "Checkpoint identity has an incompatible schema");
  }
  if (typeof value.sourceHash !== "string" || value.sourceHash.length === 0) {
    throw new TranslationError("VALIDATION", "Checkpoint identity is missing sourceHash");
  }
  if (typeof value.sourceCount !== "number" || !Number.isSafeInteger(value.sourceCount) || value.sourceCount < 1) {
    throw new TranslationError("VALIDATION", "Checkpoint identity sourceCount is invalid");
  }
  if (typeof value.targetLanguage !== "string" || value.targetLanguage.trim().length === 0) {
    throw new TranslationError("VALIDATION", "Checkpoint identity targetLanguage is invalid");
  }
  if (typeof value.promptHash !== "string" || value.promptHash.length === 0) {
    throw new TranslationError("VALIDATION", "Checkpoint identity is missing promptHash");
  }
  if (!Array.isArray(value.placeholders) || value.placeholders.some((token) => typeof token !== "string")) {
    throw new TranslationError("VALIDATION", "Checkpoint identity placeholders must be strings");
  }
  if (typeof value.provider !== "string" || typeof value.model !== "string" || typeof value.baseUrl !== "string") {
    throw new TranslationError("VALIDATION", "Checkpoint identity model settings are invalid");
  }
  if (typeof value.temperature !== "number" || !Number.isFinite(value.temperature)) {
    throw new TranslationError("VALIDATION", "Checkpoint identity temperature is invalid");
  }
  if (typeof value.batchSize !== "number" || !Number.isSafeInteger(value.batchSize) || value.batchSize < 1) {
    throw new TranslationError("VALIDATION", "Checkpoint identity batchSize is invalid");
  }
  return {
    schemaVersion: 1,
    sourceHash: value.sourceHash,
    sourceCount: value.sourceCount,
    targetLanguage: value.targetLanguage,
    promptHash: value.promptHash,
    placeholders: value.placeholders,
    provider: value.provider,
    model: value.model,
    baseUrl: value.baseUrl,
    temperature: value.temperature,
    batchSize: value.batchSize,
  };
}

export function parseStoredCorpusItem(value: unknown, index: number): CorpusItem {
  if (!isRecord(value)) {
    throw new TranslationError("VALIDATION", `Checkpoint source item ${index} must be an object`);
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new TranslationError("VALIDATION", `Checkpoint source item ${index} is missing id`);
  }
  if (typeof value.text !== "string") {
    throw new TranslationError("VALIDATION", `Checkpoint source item ${index} is missing text`);
  }
  if (!isRecord(value.source)) {
    throw new TranslationError("VALIDATION", `Checkpoint source item ${index} is missing source mapping`);
  }
  return {
    id: value.id,
    text: value.text,
    source: parseSourceMapping(value.source, index),
  };
}

function parseSourceMapping(value: Record<string, unknown>, index: number): CorpusSourceMapping {
  if (typeof value.archiveHeader !== "string" || typeof value.entryName !== "string") {
    throw new TranslationError("VALIDATION", `Checkpoint source item ${index} mapping is missing archive paths`);
  }
  if (typeof value.recordId !== "string" || value.recordId.trim().length === 0) {
    throw new TranslationError("VALIDATION", `Checkpoint source item ${index} mapping is missing recordId`);
  }
  if (typeof value.entryIndex !== "number" || !Number.isSafeInteger(value.entryIndex)) {
    throw new TranslationError("VALIDATION", `Checkpoint source item ${index} mapping entryIndex is invalid`);
  }
  if (value.extra !== undefined && !isRecord(value.extra)) {
    throw new TranslationError("VALIDATION", `Checkpoint source item ${index} mapping extra is invalid`);
  }
  const extra: Record<string, string | number | undefined> = {};
  if (isRecord(value.extra)) {
    for (const [key, entry] of Object.entries(value.extra)) {
      if (entry === undefined || typeof entry === "string" || typeof entry === "number") {
        extra[key] = entry;
        continue;
      }
      throw new TranslationError("VALIDATION", `Checkpoint source item ${index} extra.${key} is invalid`);
    }
  }
  return {
    archiveHeader: value.archiveHeader,
    archivePayload: optionalStoredString(value.archivePayload, `source.archivePayload at ${index}`),
    entryName: value.entryName,
    entryType: optionalStoredString(value.entryType, `source.entryType at ${index}`),
    entryIndex: value.entryIndex,
    payloadOffset: optionalStoredInt(value.payloadOffset, `source.payloadOffset at ${index}`),
    storedSize: optionalStoredInt(value.storedSize, `source.storedSize at ${index}`),
    contentSize: optionalStoredInt(value.contentSize, `source.contentSize at ${index}`),
    recordId: value.recordId,
    sourceByteOffset: optionalStoredInt(value.sourceByteOffset, `source.sourceByteOffset at ${index}`),
    extra,
  };
}

function optionalStoredString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new TranslationError("VALIDATION", `Checkpoint ${label} must be a string`);
  }
  return value;
}

function optionalStoredInt(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TranslationError("VALIDATION", `Checkpoint ${label} must be an integer`);
  }
  return value;
}

function readSourceItem(row: unknown, label: string): { readonly id: string; readonly sourceText: string } {
  if (!isRecord(row) || typeof row.id !== "string" || row.id.trim().length === 0) {
    throw new TranslationError("VALIDATION", `Checkpoint ${label} is missing id`);
  }
  if (typeof row.sourceText !== "string") {
    throw new TranslationError("VALIDATION", `Checkpoint ${label} is missing sourceText`);
  }
  return { id: row.id, sourceText: row.sourceText };
}

function readTranslationItem(row: unknown, label: string): { readonly id: string; readonly text: string } {
  if (!isRecord(row) || typeof row.id !== "string" || row.id.trim().length === 0) {
    throw new TranslationError("VALIDATION", `Checkpoint ${label} is missing id`);
  }
  if (typeof row.text !== "string") {
    throw new TranslationError("VALIDATION", `Checkpoint ${label} is missing text`);
  }
  return { id: row.id, text: row.text };
}
