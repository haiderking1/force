import { TranslationError } from "./errors.ts";

export function assertPlaceholderSpecs(placeholders: readonly string[]): void {
  const seen = new Set<string>();
  for (const token of placeholders) {
    if (token.length === 0 || token.trim().length === 0) {
      throw new TranslationError("VALIDATION", "Placeholder tokens must be non-empty");
    }
    if (seen.has(token)) {
      throw new TranslationError("VALIDATION", `Duplicate placeholder token: ${token}`);
    }
    seen.add(token);
  }
}

export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) {
      break;
    }
    count += 1;
    from = at + needle.length;
  }
  return count;
}

export function missingPlaceholders(
  source: string,
  translated: string,
  placeholders: readonly string[],
): string[] {
  const missing: string[] = [];
  for (const token of placeholders) {
    const expected = countOccurrences(source, token);
    if (expected === 0) {
      continue;
    }
    if (countOccurrences(translated, token) !== expected) {
      missing.push(token);
    }
  }
  return missing;
}
