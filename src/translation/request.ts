import { TranslationError } from "./errors.ts";
import { assertPlaceholderSpecs } from "./placeholders.ts";
import type { TranslateRequest } from "./types.ts";

export function assertValidTranslateRequest(request: TranslateRequest): void {
  const target = request.targetLanguage.trim();
  if (target.length === 0) {
    throw new TranslationError("VALIDATION", "Target language must be non-empty");
  }
  if (request.items.length === 0) {
    throw new TranslationError("VALIDATION", "Translation requires at least one text item");
  }
  assertPlaceholderSpecs(request.placeholders);
  const seen = new Set<string>();
  for (const item of request.items) {
    if (item.id.trim().length === 0) {
      throw new TranslationError("VALIDATION", "Text ids must be non-empty");
    }
    if (seen.has(item.id)) {
      throw new TranslationError("VALIDATION", `Duplicate text id: ${item.id}`);
    }
    seen.add(item.id);
  }
}
