import { TranslationError } from "../errors.ts";
import { isRecord } from "../unknown.ts";
import { CHECKPOINT_SCHEMA_VERSION, type StoredUnresolved, type StoredUnresolvedItem } from "./types.ts";

export function parseStoredUnresolved(value: unknown): StoredUnresolved {
  if (!isRecord(value)) {
    throw new TranslationError("VALIDATION", "Checkpoint unresolved list must be a JSON object");
  }
  if (value.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    throw new TranslationError("VALIDATION", "Checkpoint unresolved list has an incompatible schema");
  }
  if (typeof value.identityHash !== "string" || value.identityHash.length === 0) {
    throw new TranslationError("VALIDATION", "Checkpoint unresolved list is missing identityHash");
  }
  if (!Array.isArray(value.items)) {
    throw new TranslationError("VALIDATION", "Checkpoint unresolved list is missing items");
  }
  return {
    schemaVersion: 1,
    identityHash: value.identityHash,
    items: value.items.map((row, index) => parseStoredUnresolvedItem(row, index)),
  };
}

function parseStoredUnresolvedItem(value: unknown, index: number): StoredUnresolvedItem {
  if (!isRecord(value)) {
    throw new TranslationError("VALIDATION", `Checkpoint unresolved item ${index} must be an object`);
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new TranslationError("VALIDATION", `Checkpoint unresolved item ${index} is missing id`);
  }
  if (typeof value.sourceText !== "string") {
    throw new TranslationError("VALIDATION", `Checkpoint unresolved item ${index} is missing sourceText`);
  }
  if (typeof value.sourceHash !== "string" || value.sourceHash.length === 0) {
    throw new TranslationError("VALIDATION", `Checkpoint unresolved item ${index} is missing sourceHash`);
  }
  if (
    typeof value.originBatchIndex !== "number" ||
    !Number.isSafeInteger(value.originBatchIndex) ||
    value.originBatchIndex < 0
  ) {
    throw new TranslationError("VALIDATION", `Checkpoint unresolved item ${index} originBatchIndex is invalid`);
  }
  if (typeof value.attempts !== "number" || !Number.isSafeInteger(value.attempts) || value.attempts < 1) {
    throw new TranslationError("VALIDATION", `Checkpoint unresolved item ${index} attempts is invalid`);
  }
  if (!isRecord(value.error) || typeof value.error.code !== "string" || typeof value.error.message !== "string") {
    throw new TranslationError("VALIDATION", `Checkpoint unresolved item ${index} is missing error details`);
  }
  if (typeof value.diagnostics !== "string" || value.diagnostics.length === 0) {
    throw new TranslationError("VALIDATION", `Checkpoint unresolved item ${index} is missing diagnostics`);
  }
  return {
    id: value.id,
    sourceText: value.sourceText,
    sourceHash: value.sourceHash,
    originBatchIndex: value.originBatchIndex,
    attempts: value.attempts,
    error: { code: value.error.code, message: value.error.message },
    diagnostics: value.diagnostics,
  };
}
