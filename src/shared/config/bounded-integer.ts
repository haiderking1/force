import { readOptional } from "./optional-string.ts";

export function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
  pattern: RegExp,
  issues: string[],
): number {
  const value = readOptional(raw);
  if (value === undefined) {
    return fallback;
  }
  if (!pattern.test(value)) {
    issues.push(`${name} must be an integer`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    issues.push(`${name} must be between ${min} and ${max}`);
    return fallback;
  }
  return parsed;
}
