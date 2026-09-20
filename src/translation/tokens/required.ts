import { countOccurrences } from "../placeholders.ts";
import { collectTokensInText } from "./scan.ts";

export type RequiredTokenCount = {
  readonly token: string;
  readonly count: number;
};

export function requiredTokenCountsForText(
  text: string,
  placeholders: readonly string[],
): readonly RequiredTokenCount[] {
  const tokens = new Set<string>();
  for (const token of collectTokensInText(text)) {
    tokens.add(token);
  }
  for (const token of placeholders) {
    if (token.length === 0) {
      continue;
    }
    if (countOccurrences(text, token) > 0) {
      tokens.add(token);
    }
  }
  const ordered = [...tokens].sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }
    return left.localeCompare(right);
  });
  const counts: RequiredTokenCount[] = [];
  for (const token of ordered) {
    const count = countOccurrences(text, token);
    if (count > 0) {
      counts.push({ token, count });
    }
  }
  return counts;
}
