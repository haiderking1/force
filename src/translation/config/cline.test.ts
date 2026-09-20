import { expect, test } from "bun:test";
import { loadTranslationConfig } from "./load.ts";
import { TRANSLATION_PROVIDERS } from "./schema.ts";

test("explicit cline selects paid defaults without changing worker or timeout behavior", () => {
  expect(TRANSLATION_PROVIDERS).toContain("cline");
  for (const model of [undefined, "", "   "]) {
    const config = loadTranslationConfig({
      FORCE_TRANSLATION_PROVIDER: "cline",
      FORCE_TRANSLATION_API_KEY: "test-key",
      FORCE_TRANSLATION_MODEL: model,
      FORCE_TRANSLATION_TIMEOUT_MS: "1",
    });
    expect(config).toEqual({
      provider: "cline", baseUrl: "https://api.cline.bot/api/v1",
      model: "deepseek/deepseek-v4.1-flash", apiKey: "test-key",
      targetLanguage: "ar", maxRetries: 2, retryBackoffMs: 500,
      workers: 100, batchSize: 50, temperature: 0,
    });
    expect(config).not.toHaveProperty("timeoutMs");
  }
});

test("model overrides do not select a provider", () => {
  for (const provider of [undefined, "cline-free", "cline"] as const) {
    const config = loadTranslationConfig({
      FORCE_TRANSLATION_PROVIDER: provider,
      FORCE_TRANSLATION_API_KEY: "test-key",
      FORCE_TRANSLATION_MODEL: "vendor/custom-model",
    });
    expect(config.provider).toBe(provider ?? "cline-free");
    expect(config.model).toBe("vendor/custom-model");
  }
});

test("explicit free and omitted provider retain the free model", () => {
  for (const provider of [undefined, "cline-free"]) {
    const config = loadTranslationConfig({ FORCE_TRANSLATION_PROVIDER: provider }, { requireApiKey: false });
    expect(config.provider).toBe("cline-free");
    expect(config.model).toBe("cline-free/deepseek-v4.1-flash");
  }
});
