import { expect, test } from "bun:test";
import { TranslationError } from "../errors.ts";
import { CLINE_FREE_BASE_URL, CLINE_FREE_MODEL } from "../providers/cline-free/contract.ts";
import { loadTranslationConfig } from "./load.ts";
import { TRANSLATION_ENV } from "./schema.ts";

test("applies verified Cline Free defaults when only a key is set", () => {
  const config = loadTranslationConfig({ [TRANSLATION_ENV.API_KEY]: " test-token " });
  expect(config).toEqual({
    provider: "cline-free",
    baseUrl: CLINE_FREE_BASE_URL,
    model: CLINE_FREE_MODEL,
    apiKey: "test-token",
    targetLanguage: "ar",
    maxRetries: 2,
    retryBackoffMs: 500,
    workers: 100,
    batchSize: 50,
    temperature: 0,
  });
});

test("accepts a complete valid environment", () => {
  const config = loadTranslationConfig({
    [TRANSLATION_ENV.PROVIDER]: "cline-free",
    [TRANSLATION_ENV.BASE_URL]: "https://api.example.test/v1/",
    [TRANSLATION_ENV.MODEL]: "vendor/model-1",
    [TRANSLATION_ENV.API_KEY]: "secret-key",
    [TRANSLATION_ENV.TARGET_LANGUAGE]: "ar-SA",
    [TRANSLATION_ENV.MAX_RETRIES]: "0",
    [TRANSLATION_ENV.RETRY_BACKOFF_MS]: "0",
    [TRANSLATION_ENV.WORKERS]: "8",
    [TRANSLATION_ENV.BATCH_SIZE]: "1",
    [TRANSLATION_ENV.TEMPERATURE]: "0.2",
  });
  expect(config.baseUrl).toBe("https://api.example.test/v1");
  expect(config.model).toBe("vendor/model-1");
  expect(config.targetLanguage).toBe("ar-SA");
  expect(config.maxRetries).toBe(0);
  expect(config.retryBackoffMs).toBe(0);
  expect(config.workers).toBe(8);
  expect(config.batchSize).toBe(1);
  expect(config.temperature).toBe(0.2);
});

test("ignores FORCE_TRANSLATION_TIMEOUT_MS if it is still present", () => {
  const config = loadTranslationConfig({
    [TRANSLATION_ENV.API_KEY]: "k",
    FORCE_TRANSLATION_TIMEOUT_MS: "0",
  });
  expect(config.workers).toBe(100);
  expect(config).not.toHaveProperty("timeoutMs");
});

test("requires an API key unless dry-run loading is requested", () => {
  expect(() => loadTranslationConfig({})).toThrow(TranslationError);
  expect(() => loadTranslationConfig({})).toThrow(/FORCE_TRANSLATION_API_KEY is required/);
  const config = loadTranslationConfig({}, { requireApiKey: false });
  expect(config.apiKey).toBe("");
});

test("rejects unknown providers, credential URLs, and malformed numbers", () => {
  expect(() =>
    loadTranslationConfig({
      [TRANSLATION_ENV.API_KEY]: "k",
      [TRANSLATION_ENV.PROVIDER]: "openai",
    }),
  ).toThrow(/FORCE_TRANSLATION_PROVIDER must be one of cline-free/);

  expect(() =>
    loadTranslationConfig({
      [TRANSLATION_ENV.API_KEY]: "k",
      [TRANSLATION_ENV.BASE_URL]: "https://user:pass@api.cline.bot/api/v1",
    }),
  ).toThrow(/must not include credentials/);

  expect(() =>
    loadTranslationConfig({
      [TRANSLATION_ENV.API_KEY]: "k",
      [TRANSLATION_ENV.BASE_URL]: "ftp://api.cline.bot/api/v1",
    }),
  ).toThrow(/http or https URL/);

  expect(() =>
    loadTranslationConfig({
      [TRANSLATION_ENV.API_KEY]: "k",
      [TRANSLATION_ENV.MODEL]: "deep seek",
    }),
  ).toThrow(/model id without whitespace/);

  expect(() =>
    loadTranslationConfig({
      [TRANSLATION_ENV.API_KEY]: "k",
      [TRANSLATION_ENV.WORKERS]: "0",
    }),
  ).toThrow(/WORKERS must be an integer/);

  expect(() =>
    loadTranslationConfig({
      [TRANSLATION_ENV.API_KEY]: "k",
      [TRANSLATION_ENV.WORKERS]: "1001",
    }),
  ).toThrow(/WORKERS must be between 1 and 1000/);

  expect(() =>
    loadTranslationConfig({
      [TRANSLATION_ENV.API_KEY]: "k",
      [TRANSLATION_ENV.BATCH_SIZE]: "201",
    }),
  ).toThrow(/BATCH_SIZE must be between 1 and 200/);

  expect(() =>
    loadTranslationConfig({
      [TRANSLATION_ENV.API_KEY]: "k",
      [TRANSLATION_ENV.MAX_RETRIES]: "2.5",
    }),
  ).toThrow(/MAX_RETRIES must be an integer/);

  expect(() =>
    loadTranslationConfig({
      [TRANSLATION_ENV.API_KEY]: "k",
      [TRANSLATION_ENV.TEMPERATURE]: "3",
    }),
  ).toThrow(/TEMPERATURE must be a number from 0 to 2/);
});

test("treats a whitespace API key as missing", () => {
  expect(() => loadTranslationConfig({ [TRANSLATION_ENV.API_KEY]: "   " })).toThrow(
    /FORCE_TRANSLATION_API_KEY is required/,
  );
});
