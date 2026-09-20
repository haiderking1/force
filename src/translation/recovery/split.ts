import { TranslationError } from "../errors.ts";

export function splitItems<T>(items: readonly T[]): readonly [readonly T[], readonly T[]] {
  if (items.length < 2) {
    throw new TranslationError("VALIDATION", "Recovery split requires at least two items");
  }
  const mid = Math.floor(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}
