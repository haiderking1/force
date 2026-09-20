import { expect, test } from "bun:test";
import { loadTranslationConfig } from "../../config/load.ts";
import { createTranslationClient } from "../../create-client.ts";
import { SAMPLE_REQUEST, VALID_TRANSLATIONS_JSON, completionEnvelope } from "../../http/fixtures/completions.ts";
import { CLINE_FREE_HEADERS } from "../cline-free/contract.ts";
import { createClineFreeTranslationClient } from "../cline-free/create-client.ts";
import { createClineTranslationClient } from "./create-client.ts";

for (const provider of ["cline", "cline-free", "cline-pass"] as const) {
  for (const key of ["test-api-key", "workos:test-token"]) {
    test("factory routes " + provider + " with unchanged Bearer and wrapped completion", async () => {
      const config = loadTranslationConfig({ FORCE_TRANSLATION_PROVIDER: provider, FORCE_TRANSLATION_API_KEY: key });
      let calls = 0;
      const client = createTranslationClient(config, { fetch: async (url, init) => {
        calls += 1;
        expect(url).toBe("https://api.cline.bot/api/v1/chat/completions");
        expect(init.method).toBe("POST");
        expect(init.redirect).toBe("error");
        expect(init.signal).toBeUndefined();
        expect([...new Headers(init.headers)]).toEqual([...new Headers({
          ...(provider === "cline-free" ? CLINE_FREE_HEADERS : {}),
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
        })]);
        const body: unknown = JSON.parse(String(init.body));
        expect(body).toMatchObject({
          model: provider === "cline" ? "deepseek/deepseek-v4.1-flash" : `${provider}/deepseek-v4.1-flash`,
          include_reasoning: true, reasoning: { effort: "none" },
          temperature: 0, response_format: { type: "json_object" },
        });
        for (const field of ["provider", "reasoning_effort", "thinking", "enable_thinking"]) {
          expect(body).not.toHaveProperty(field);
        }
        return Response.json({ success: true, data: completionEnvelope(VALID_TRANSLATIONS_JSON) });
      }});
      const result = await client.translateBatch(SAMPLE_REQUEST);
      expect(result.translations).toEqual([
        { id: "greet", text: "مرحبا، {name}!" },
        { id: "score", text: "النتيجة: %s" },
      ]);
      expect(calls).toBe(1);
    });
  }
}

test("paid route honors explicit models and adapters reject mismatched providers", () => {
  const paid = loadTranslationConfig({ FORCE_TRANSLATION_PROVIDER: "cline", FORCE_TRANSLATION_MODEL: "vendor/custom" }, { requireApiKey: false });
  expect(createTranslationClient(paid).buildOutbound(SAMPLE_REQUEST).body.model).toBe("vendor/custom");
  expect(() => createClineFreeTranslationClient(paid)).toThrow("received provider cline");
  const free = loadTranslationConfig({}, { requireApiKey: false });
  expect(() => createClineTranslationClient(free)).toThrow("received provider cline-free");
});
