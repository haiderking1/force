import { TranslationError } from "../errors.ts";
import { missingPlaceholders } from "../placeholders.ts";
import type { SourceText, TranslationItem } from "../types.ts";

export function assertBatchPreserved(
  items: readonly SourceText[],
  translations: readonly TranslationItem[],
  placeholders: readonly string[],
): void {
  const byId = new Map(translations.map((row) => [row.id, row.text]));
  for (const item of items) {
    const text = byId.get(item.id);
    if (text === undefined) {
      throw new TranslationError("RESPONSE", `Translation response is missing ids: ${item.id}`);
    }
    if (item.text.length > 0 && text.length === 0) {
      throw new TranslationError("RESPONSE", `Translation for ${item.id} removed the source text`);
    }
    const missing = missingPlaceholders(item.text, text, placeholders);
    if (missing.length > 0) {
      throw new TranslationError(
        "RESPONSE",
        `Translation for ${item.id} is missing placeholders: ${missing.join(", ")}`,
      );
    }
  }
}
