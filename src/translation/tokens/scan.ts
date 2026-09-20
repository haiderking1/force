import {
  collectBraceTokens,
  collectBracketTokens,
  collectEscapeTokens,
  collectMarkupTokens,
  collectPrintfTokens,
  collectSlashTokens,
  collectUnderscoreTokens,
} from "./patterns.ts";

export function collectTokensInText(text: string): string[] {
  return [
    ...collectPrintfTokens(text),
    ...collectBraceTokens(text),
    ...collectBracketTokens(text),
    ...collectMarkupTokens(text),
    ...collectSlashTokens(text),
    ...collectUnderscoreTokens(text),
    ...collectEscapeTokens(text),
  ];
}

export function collectPlaceholderTokens(texts: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    for (const token of collectTokensInText(text)) {
      seen.add(token);
    }
  }
  return [...seen].sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }
    return left.localeCompare(right);
  });
}

export function mergePlaceholderTokens(
  discovered: readonly string[],
  explicit: readonly string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const token of [...explicit, ...discovered]) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    merged.push(token);
  }
  return merged.sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }
    return left.localeCompare(right);
  });
}
