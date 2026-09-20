import { expect, test } from "bun:test";
import { unwrapClineCompletion } from "./response.ts";
import { createClineFreeTranslationClient } from "./create-client.ts";
import { loadTranslationConfig } from "../../config/load.ts";

test("preserves standard completions and unwraps verified Cline envelopes", () => {
  const completion = { choices: [{ message: { content: "test" } }] };
  expect(unwrapClineCompletion(completion)).toBe(completion);
  expect(unwrapClineCompletion({success: true, data: completion})).toBe(completion);
  for (const payload of [{success: false, data: completion}, {success: true}, {success: true, data: null}, {success: true, data: []}]) {
    expect(() => unwrapClineCompletion(payload)).toThrow("malformed completion envelope");
  }
});

test("translates a wrapped Cline response with a verbatim API key", async () => {
  const config = loadTranslationConfig({FORCE_TRANSLATION_API_KEY: "test-api-key"});
  const client = createClineFreeTranslationClient(config, {fetch: async (_url, init) => {
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-api-key");
    return Response.json({success: true, data: {choices: [{message: {content: JSON.stringify({translations: [{id: "menu", text: "متابعة"}]})}}]}});
  }});
  expect(await client.translate({targetLanguage: "ar", items: [{id: "menu", text: "Continue"}], placeholders: []})).toEqual({translations: [{id: "menu", text: "متابعة"}]});
});
