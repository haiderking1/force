import { DiscoveryError } from "../errors.ts";
import {
  JEV_DEFAULT_BASE_URL,
  JEV_DEFAULT_MODEL,
} from "./contract.ts";

export type EnvRecord = Record<string, string | undefined>;

export const JEV_ENV = {
  API_KEY: "FORCE_JEV_API_KEY",
  BASE_URL: "FORCE_JEV_BASE_URL",
  MODEL: "FORCE_JEV_MODEL",
  MAX_RETRIES: "FORCE_JEV_MAX_RETRIES",
  RETRY_BACKOFF_MS: "FORCE_JEV_RETRY_BACKOFF_MS",
  CONCURRENCY: "FORCE_JEV_CONCURRENCY",
} as const;

export const JEV_DEFAULT_CONCURRENCY = 4;
export const JEV_MAX_CONCURRENCY = 16;
export const JEV_MIN_CONCURRENCY = 1;

export type JevConfig = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly maxRetries: number;
  readonly retryBackoffMs: number;
  readonly concurrency: number;
};

export type LoadJevConfigOptions = {
  readonly requireApiKey?: boolean;
};

const MODEL_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const NON_NEGATIVE_INT = /^\d+$/;
const POSITIVE_INT = /^[1-9]\d*$/;

export function loadJevConfig(env: EnvRecord, options: LoadJevConfigOptions = {}): JevConfig {
  const requireApiKey = options.requireApiKey ?? true;
  const issues: string[] = [];
  const apiKey = (env[JEV_ENV.API_KEY] ?? "").trim();
  if (requireApiKey && apiKey.length === 0) {
    issues.push(`${JEV_ENV.API_KEY} is required`);
  }
  const baseUrl = parseBaseUrl(readOptional(env[JEV_ENV.BASE_URL]) ?? JEV_DEFAULT_BASE_URL, issues);
  const model = parseModel(readOptional(env[JEV_ENV.MODEL]) ?? JEV_DEFAULT_MODEL, issues);
  const maxRetries = parseBoundedInt(
    env[JEV_ENV.MAX_RETRIES],
    2,
    JEV_ENV.MAX_RETRIES,
    0,
    10,
    NON_NEGATIVE_INT,
    issues,
  );
  const retryBackoffMs = parseBoundedInt(
    env[JEV_ENV.RETRY_BACKOFF_MS],
    500,
    JEV_ENV.RETRY_BACKOFF_MS,
    0,
    60_000,
    NON_NEGATIVE_INT,
    issues,
  );
  const concurrency = parseBoundedInt(
    env[JEV_ENV.CONCURRENCY],
    JEV_DEFAULT_CONCURRENCY,
    JEV_ENV.CONCURRENCY,
    JEV_MIN_CONCURRENCY,
    JEV_MAX_CONCURRENCY,
    POSITIVE_INT,
    issues,
  );
  if (issues.length > 0) {
    throw new DiscoveryError("CONFIG", `Invalid Jev configuration: ${issues.join("; ")}`);
  }
  return { apiKey, baseUrl, model, maxRetries, retryBackoffMs, concurrency };
}

function readOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseBaseUrl(value: string, issues: string[]): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      issues.push(`${JEV_ENV.BASE_URL} must be an http or https URL`);
      return JEV_DEFAULT_BASE_URL;
    }
    if (url.username.length > 0 || url.password.length > 0) {
      issues.push(`${JEV_ENV.BASE_URL} must not include credentials`);
      return JEV_DEFAULT_BASE_URL;
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    issues.push(`${JEV_ENV.BASE_URL} must be an absolute URL`);
    return JEV_DEFAULT_BASE_URL;
  }
}

function parseModel(value: string, issues: string[]): string {
  if (!MODEL_PATTERN.test(value)) {
    issues.push(`${JEV_ENV.MODEL} must be a non-empty model id without whitespace`);
    return JEV_DEFAULT_MODEL;
  }
  return value;
}

function parseBoundedInt(
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
