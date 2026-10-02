import { TranslationError } from "../errors.ts";
import { countOccurrences } from "../placeholders.ts";
import { validateTranslations } from "../response.ts";
import type { TranslateRequest, TranslateResult } from "../types.ts";
import { requiredTokenCountsForText } from "./required.ts";

// Protect opaque engine syntax without splitting the sentence or changing word context.
export function protectRequest(original: TranslateRequest) {
  let prefix = "__FORCE_TOKEN_";
  while (original.items.some(item => item.text.includes(prefix))) prefix = "_" + prefix;
  const bindings: { id: string; marker: string; token: string }[] = [];
  const items = original.items.map(item => {
    const tokens = requiredTokenCountsForText(item.text, original.placeholders).map(row => row.token);
    // Some resources contain a known slash marker with its final slash missing.
    // Preserve that spelling too; never silently repair the installed game's data.
    const stems = tokens.filter(token => /^\/[A-Za-z_][A-Za-z0-9_]*\/$/.test(token))
      .map(token => token.slice(0, -1));
    let text = "";
    for (let offset = 0; offset < item.text.length;) {
      const token = tokens.find(candidate => item.text.startsWith(candidate, offset)) ??
        stems.find(candidate => {
          if (!item.text.startsWith(candidate, offset)) return false;
          const next = item.text[offset + candidate.length];
          return next === undefined || /[\s?!.,;:]/.test(next);
        });
      if (token === undefined) {
        text += item.text[offset];
        offset++;
      } else {
        const marker = prefix + bindings.length + "__";
        bindings.push({ id: item.id, marker, token });
        text += marker;
        offset += token.length;
      }
    }
    return { id: item.id, text, ...(item.context === undefined ? {} : { context: item.context }) };
  });
  const request: TranslateRequest = {
    ...original, items, placeholders: bindings.map(binding => binding.marker),
  };
  return {
    request,
    restore(result: TranslateResult): TranslateResult {
      const translations = validateTranslations(result, request).map(item => {
        let text = item.text;
        let last = -1;
        for (const binding of bindings.filter(binding => binding.id === item.id)) {
          const position = text.indexOf(binding.marker);
          if (countOccurrences(text, binding.marker) !== 1 || position <= last) {
            throw new TranslationError("RESPONSE", "Protected tokens were missing, duplicated, or reordered");
          }
          last = position;
        }
        // Reject cross-item or invented markers before restoring original bytes.
        let remainder = text;
        for (const binding of bindings.filter(binding => binding.id === item.id)) {
          remainder = remainder.replace(binding.marker, "");
          text = text.replace(binding.marker, binding.token);
        }
        if (remainder.includes(prefix)) throw new TranslationError("RESPONSE", "Unexpected protected token");
        return { id: item.id, text };
      });
      return { translations: validateTranslations({ translations }, original) };
    },
  };
}
