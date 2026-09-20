import { CLINE_MODEL, CLINE_PROVIDER } from "../providers/cline/contract.ts";
import { CLINE_BASE_URL, CLINE_DEFAULTS } from "../providers/cline-common/contract.ts";
import { TranslationError } from "../errors.ts";
import {
  MAX_BATCH_SIZE,
  MAX_WORKERS,
  MIN_BATCH_SIZE,
  MIN_WORKERS,
} from "../pool/settings.ts";
import {
  CLINE_FREE_MODEL,
  CLINE_FREE_PROVIDER,
} from "../providers/cline-free/contract.ts";
import {
  TRANSLATION_ENV,
  TRANSLATION_PROVIDERS,
  type EnvRecord,
  type LoadTranslationConfigOptions,
  type TranslationConfig,
  type TranslationProvider,
} from "./schema.ts";

import { CLINE_PASS_MODEL, CLINE_PASS_PROVIDER, isClinePassModel } from "../providers/cline-pass/contract.ts";

const MODEL_PATTERN = /^[A-Za-z0-9_.:/-]+$/;
const POSITIVE_INT = /^[1-9]\d*$/;
const NON_NEGATIVE_INT = /^\d+$/;
const DECIMAL = /^\d+(\.\d+)?$/;

export function loadTranslationConfig(
  env: EnvRecord,
  options: LoadTranslationConfigOptions = {},
): TranslationConfig {
  const requireApiKey = options.requireApiKey ?? true;
  const issues: string[] = [];

  const providerRaw = readOptional(env[TRANSLATION_ENV.PROVIDER]) ?? CLINE_FREE_PROVIDER;
  const provider = parseProvider(providerRaw, issues);
  const baseUrl = parseBaseUrl(readOptional(env[TRANSLATION_ENV.BASE_URL]) ?? CLINE_BASE_URL, issues);
  const defaultModel = provider === CLINE_PASS_PROVIDER
    ? CLINE_PASS_MODEL
    : provider === CLINE_PROVIDER ? CLINE_MODEL : CLINE_FREE_MODEL;
  const model = parseModel(readOptional(env[TRANSLATION_ENV.MODEL]) ?? defaultModel, issues);
  if (provider === CLINE_PASS_PROVIDER && !isClinePassModel(model)) {
    issues.push(`${TRANSLATION_ENV.MODEL} must use a cline-pass/ model id for cline-pass`);
  }
  const apiKey = (env[TRANSLATION_ENV.API_KEY] ?? "").trim();
  if (requireApiKey && apiKey.length === 0) {
    issues.push(`${TRANSLATION_ENV.API_KEY} is required`);
  }
  const targetLanguage = parseTargetLanguage(
    readOptional(env[TRANSLATION_ENV.TARGET_LANGUAGE]) ?? CLINE_DEFAULTS.targetLanguage,
    issues,
  );
  const maxRetries = parseBoundedInt(
    env[TRANSLATION_ENV.MAX_RETRIES],
    CLINE_DEFAULTS.maxRetries,
    TRANSLATION_ENV.MAX_RETRIES,
    0,
    10,
    NON_NEGATIVE_INT,
    issues,
  );
  const retryBackoffMs = parseBoundedInt(
    env[TRANSLATION_ENV.RETRY_BACKOFF_MS],
    CLINE_DEFAULTS.retryBackoffMs,
    TRANSLATION_ENV.RETRY_BACKOFF_MS,
    0,
    60_000,
    NON_NEGATIVE_INT,
    issues,
  );
  const workers = parseBoundedInt(
    env[TRANSLATION_ENV.WORKERS],
    CLINE_DEFAULTS.workers,
    TRANSLATION_ENV.WORKERS,
    MIN_WORKERS,
    MAX_WORKERS,
    POSITIVE_INT,
    issues,
  );
  const batchSize = parseBoundedInt(
    env[TRANSLATION_ENV.BATCH_SIZE],
    CLINE_DEFAULTS.batchSize,
    TRANSLATION_ENV.BATCH_SIZE,
    MIN_BATCH_SIZE,
    MAX_BATCH_SIZE,
    POSITIVE_INT,
    issues,
  );
  const temperature = parseTemperature(env[TRANSLATION_ENV.TEMPERATURE], CLINE_DEFAULTS.temperature, issues);

  if (issues.length > 0) {
    throw new TranslationError("CONFIG", `Invalid translation configuration: ${issues.join("; ")}`);
  }

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    targetLanguage,
    maxRetries,
    retryBackoffMs,
    workers,
    batchSize,
    temperature,
  };
}

function readOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseProvider(value: string, issues: string[]): TranslationProvider {
  for (const provider of TRANSLATION_PROVIDERS) {
    if (provider === value) {
      return provider;
    }
  }
  issues.push(
    `${TRANSLATION_ENV.PROVIDER} must be one of ${TRANSLATION_PROVIDERS.join(", ")}`,
  );
  return CLINE_FREE_PROVIDER;
}

function parseBaseUrl(value: string, issues: string[]): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      issues.push(`${TRANSLATION_ENV.BASE_URL} must be an http or https URL`);
      return CLINE_BASE_URL;
    }
    if (url.username.length > 0 || url.password.length > 0) {
      issues.push(`${TRANSLATION_ENV.BASE_URL} must not include credentials`);
      return CLINE_BASE_URL;
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    issues.push(`${TRANSLATION_ENV.BASE_URL} must be an absolute URL`);
    return CLINE_BASE_URL;
  }
}

function parseModel(value: string, issues: string[]): string {
  if (!MODEL_PATTERN.test(value)) {
    issues.push(`${TRANSLATION_ENV.MODEL} must be a non-empty model id without whitespace`);
    return CLINE_FREE_MODEL;
  }
  return value;
}

function parseTargetLanguage(value: string, issues: string[]): string {
  if (value.length === 0) {
    issues.push(`${TRANSLATION_ENV.TARGET_LANGUAGE} must be non-empty`);
    return CLINE_DEFAULTS.targetLanguage;
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

function parseTemperature(raw: string | undefined, fallback: number, issues: string[]): number {
  const value = readOptional(raw);
  if (value === undefined) {
    return fallback;
  }
  if (!DECIMAL.test(value)) {
    issues.push(`${TRANSLATION_ENV.TEMPERATURE} must be a number from 0 to 2`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    issues.push(`${TRANSLATION_ENV.TEMPERATURE} must be a number from 0 to 2`);
    return fallback;
  }
  return parsed;
}
