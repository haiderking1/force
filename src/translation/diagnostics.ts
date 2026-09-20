import { isRecord } from "./unknown.ts";

const REDACTED = "[redacted]";

const SECRET_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "api-key",
]);

const SECRET_FIELD_NAMES = new Set([
  "authorization",
  "api_key",
  "apikey",
  "api-key",
  "access_token",
  "access",
  "refresh_token",
  "refresh",
  "password",
  "secret",
  "token",
]);

export function redactText(text: string, secrets: readonly string[]): string {
  let redacted = text;
  const unique = [...new Set(secrets.filter((secret) => secret.length > 0))].sort(
    (left, right) => right.length - left.length,
  );
  for (const secret of unique) {
    redacted = redacted.split(secret).join(REDACTED);
  }
  return redacted;
}

export function redactValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") {
    return redactText(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, secrets));
  }
  if (!isRecord(value)) {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_FIELD_NAMES.has(key.toLowerCase()) || SECRET_HEADER_NAMES.has(key.toLowerCase())) {
      result[key] = REDACTED;
      continue;
    }
    result[key] = redactValue(entry, secrets);
  }
  return result;
}

export function secretsFromApiKey(apiKey: string): string[] {
  const trimmed = apiKey.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const secrets = [trimmed];
  const prefixed = trimmed.toLowerCase().startsWith("workos:") ? trimmed.slice("workos:".length) : trimmed;
  if (prefixed.length > 0 && prefixed !== trimmed) {
    secrets.push(prefixed);
  }
  return secrets;
}
