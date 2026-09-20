import { expect, test } from "bun:test";
import { loadTranslationConfig } from "./load.ts";

test("explicit cline-pass selects exact subscription defaults", () => {
  for (const model of [undefined, "", "   "]) {
    expect(loadTranslationConfig({
      FORCE_TRANSLATION_PROVIDER: "cline-pass",
      FORCE_TRANSLATION_MODEL: model,
      FORCE_TRANSLATION_API_KEY: "test-key",
    })).toEqual({
      provider: "cline-pass", baseUrl: "https://api.cline.bot/api/v1",
      model: "cline-pass/deepseek-v4.1-flash", apiKey: "test-key",
      targetLanguage: "ar", maxRetries: 2, retryBackoffMs: 500,
      workers: 100, batchSize: 50, temperature: 0,
    });
  }
});

test("cline-pass rejects stale free, paid, and invalid subscription models", () => {
  for (const model of ["cline-free/deepseek-v4.1-flash", "deepseek/deepseek-v4.1-flash", "vendor/custom", "cline-pass/", "other/cline-pass/model"]) {
    expect(() => loadTranslationConfig({
      FORCE_TRANSLATION_PROVIDER: "cline-pass",
      FORCE_TRANSLATION_MODEL: model,
    }, { requireApiKey: false })).toThrow("must use a cline-pass/ model id");
  }
});

test("cline-pass accepts explicit subscription model overrides", () => {
  expect(loadTranslationConfig({
    FORCE_TRANSLATION_PROVIDER: "cline-pass",
    FORCE_TRANSLATION_MODEL: "cline-pass/custom-model",
  }, { requireApiKey: false }).model).toBe("cline-pass/custom-model");
});
