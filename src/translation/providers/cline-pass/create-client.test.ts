import { expect, test } from "bun:test";
import { loadTranslationConfig } from "../../config/load.ts";
import { createTranslationClient } from "../../create-client.ts";
import { SAMPLE_REQUEST } from "../../http/fixtures/completions.ts";
import { createClinePassTranslationClient } from "./create-client.ts";

const config = loadTranslationConfig({
  FORCE_TRANSLATION_PROVIDER: "cline-pass",
  FORCE_TRANSLATION_API_KEY: "test-key",
});

test("Pass adapter rejects mismatched providers and manually supplied billing models", () => {
  expect(() => createClinePassTranslationClient({ ...config, provider: "cline" })).toThrow("received provider cline");
  for (const model of ["cline-free/deepseek-v4.1-flash", "deepseek/deepseek-v4.1-flash"]) {
    expect(() => createTranslationClient({ ...config, model })).toThrow("requires a cline-pass/ model id");
  }
});

test("Pass billing failure does not retry or fall back to another billing route", async () => {
  let calls = 0;
  const client = createTranslationClient(config, {
    fetch: async (url, init) => {
      calls += 1;
      expect(url).toBe("https://api.cline.bot/api/v1/chat/completions");
      expect(JSON.parse(String(init.body)).model).toBe("cline-pass/deepseek-v4.1-flash");
      return new Response(null, { status: 402 });
    },
    sleep: async () => { throw new Error("Unexpected retry"); },
  });
  await expect(client.translateBatch(SAMPLE_REQUEST)).rejects.toThrow();
  expect(calls).toBe(1);
});
