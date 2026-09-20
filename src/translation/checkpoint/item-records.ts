import { TranslationError } from "../errors.ts";
import { isRecord } from "../unknown.ts";
import { CHECKPOINT_SCHEMA_VERSION, type StoredItemSuccess } from "./types.ts";

export function parseStoredItemSuccess(value: unknown): StoredItemSuccess {
  if (!isRecord(value)) {
    throw new TranslationError("VALIDATION", "Checkpoint item must be a JSON object");
  }
  if (value.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    throw new TranslationError("VALIDATION", "Checkpoint item has an incompatible schema");
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new TranslationError("VALIDATION", "Checkpoint item is missing id");
  }
  if (typeof value.sourceText !== "string") {
    throw new TranslationError("VALIDATION", "Checkpoint item is missing sourceText");
  }
  if (typeof value.sourceHash !== "string" || value.sourceHash.length === 0) {
    throw new TranslationError("VALIDATION", "Checkpoint item is missing sourceHash");
  }
  if (typeof value.identityHash !== "string" || value.identityHash.length === 0) {
    throw new TranslationError("VALIDATION", "Checkpoint item is missing identityHash");
  }
  if (typeof value.text !== "string") {
    throw new TranslationError("VALIDATION", "Checkpoint item is missing text");
  }
  if (
    typeof value.originBatchIndex !== "number" ||
    !Number.isSafeInteger(value.originBatchIndex) ||
    value.originBatchIndex < 0
  ) {
    throw new TranslationError("VALIDATION", "Checkpoint item originBatchIndex is invalid");
  }
  return {
    schemaVersion: 1,
    id: value.id,
    sourceText: value.sourceText,
    sourceHash: value.sourceHash,
    identityHash: value.identityHash,
    text: value.text,
    originBatchIndex: value.originBatchIndex,
  };
}
