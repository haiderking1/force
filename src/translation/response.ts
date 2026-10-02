import { TranslationError } from "./errors.ts";
import { missingPlaceholders } from "./placeholders.ts";
import type { TranslateRequest, TranslationItem } from "./types.ts";
import { isRecord } from "./unknown.ts";

export function extractJsonValue(content: string): unknown {
  const trimmed = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const raw = fence?.[1] ?? trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    throw new TranslationError("RESPONSE", "Translation response is not valid JSON");
  }
}

export function readCompletionContent(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new TranslationError("RESPONSE", "Translation completion must be a JSON object");
  }
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new TranslationError("RESPONSE", "Translation completion is missing choices");
  }
  const first = choices[0];
  if (!isRecord(first)) {
    throw new TranslationError("RESPONSE", "Translation completion choice is invalid");
  }
  const message = first.message;
  if (!isRecord(message)) {
    throw new TranslationError("RESPONSE", "Translation completion message is invalid");
  }
  const content = message.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new TranslationError("RESPONSE", "Translation completion content is missing");
  }
  return content;
}

export function validateTranslations(payload: unknown, request: TranslateRequest): TranslationItem[] {
  if (!isRecord(payload)) {
    throw new TranslationError("RESPONSE", "Translation payload must be a JSON object");
  }
  const rows = payload.translations;
  if (!Array.isArray(rows)) {
    throw new TranslationError("RESPONSE", "Translation payload is missing translations");
  }

  const byId = new Map<string, string>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.text !== "string") {
      throw new TranslationError("RESPONSE", "Each translation must include string id and text");
    }
    if (row.id.trim().length === 0) {
      throw new TranslationError("RESPONSE", "Translation ids must be non-empty");
    }
    if (byId.has(row.id)) {
      throw new TranslationError("RESPONSE", `Translation response has duplicate id: ${row.id}`);
    }
    byId.set(row.id, row.text);
  }

  const expectedIds = new Set(request.items.map(item => item.id));
  const extras = [...byId.keys()].filter((id) => !expectedIds.has(id));
  if (extras.length > 0) {
    throw new TranslationError("RESPONSE", `Translation response has unexpected ids: ${extras.join(", ")}`);
  }

  const missing: string[] = [];
  const ordered: TranslationItem[] = [];
  for (const item of request.items) {
    const text = byId.get(item.id);
    if (text === undefined) {
      missing.push(item.id);
      continue;
    }
    const placeholders = missingPlaceholders(item.text, text, request.placeholders);
    if (placeholders.length > 0) {
      throw new TranslationError(
        "RESPONSE",
        `Translation for ${item.id} is missing placeholders: ${placeholders.join(", ")}`,
      );
    }
    ordered.push({ id: item.id, text });
  }
  if (missing.length > 0) {
    throw new TranslationError("RESPONSE", `Translation response is missing ids: ${missing.join(", ")}`);
  }
  return ordered;
}
