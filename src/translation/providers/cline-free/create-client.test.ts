import { expect, test } from "bun:test";
import { loadTranslationConfig } from "../../config/load.ts";
import { TRANSLATION_ENV } from "../../config/schema.ts";
import type { FetchLike } from "../../http/openai-compatible-client.ts";
import { SAMPLE_REQUEST, VALID_TRANSLATIONS_JSON, completionEnvelope } from "../../http/fixtures/completions.ts";
import {
  applyClineThinkingDisabled,
  CLINE_FREE_BASE_URL,
  CLINE_FREE_HEADERS,
  CLINE_FREE_MODEL,
  formatClineBearer,
} from "./contract.ts";
import { clineFreeCompletionsUrl, createClineFreeTranslationClient } from "./create-client.ts";

test("thinking-disable matches the verified Cline payload", () => {
  const body = applyClineThinkingDisabled({
    model: CLINE_FREE_MODEL,
    reasoning_effort: "high",
    thinking: true,
    enable_thinking: true,
    include_reasoning: false,
    reasoning: { effort: "high" },
  });
  expect(body).toEqual({
    model: CLINE_FREE_MODEL,
    include_reasoning: true,
    reasoning: { effort: "none" },
  });
  expect(body).not.toHaveProperty("reasoning_effort");
  expect(body).not.toHaveProperty("thinking");
  expect(body).not.toHaveProperty("enable_thinking");
});

test("sends API keys unchanged and preserves explicit account-token prefixes", () => {
  expect(formatClineBearer(" raw-token ")).toBe("raw-token");
  expect(formatClineBearer("workos:raw-token")).toBe("workos:raw-token");
  expect(formatClineBearer("WORKOS:raw-token")).toBe("WORKOS:raw-token");
});

test("sends the verified Cline Free DeepSeek request with thinking disabled", async () => {
  const config = loadTranslationConfig({ [TRANSLATION_ENV.API_KEY]: "raw-token" });
  let calls = 0;
  const fetchLike: FetchLike = async (url, init) => {
    calls += 1;
    expect(url).toBe(clineFreeCompletionsUrl(CLINE_FREE_BASE_URL));
    expect(url).toBe("https://api.cline.bot/api/v1/chat/completions");
    expect(init.redirect).toBe("error");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer raw-token");
    expect(headers.get("http-referer")).toBe(CLINE_FREE_HEADERS["HTTP-Referer"]);
    expect(headers.get("x-title")).toBe(CLINE_FREE_HEADERS["X-Title"]);
    expect(headers.get("x-is-multiroot")).toBe(CLINE_FREE_HEADERS["X-IS-MULTIROOT"]);
    expect(headers.get("x-client-type")).toBe(CLINE_FREE_HEADERS["X-CLIENT-TYPE"]);
    expect(headers.get("x-client-version")).toBe(CLINE_FREE_HEADERS["X-CLIENT-VERSION"]);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe(CLINE_FREE_MODEL);
    expect(body.include_reasoning).toBe(true);
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("enable_thinking");
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    return Response.json(completionEnvelope(VALID_TRANSLATIONS_JSON));
  };

  const client = createClineFreeTranslationClient(config, { fetch: fetchLike });
  const outbound = client.buildOutbound(SAMPLE_REQUEST);
  expect(outbound.body.include_reasoning).toBe(true);
  expect(outbound.body.reasoning).toEqual({ effort: "none" });
  expect(outbound.headers.Authorization).toBe("Bearer raw-token");
  const result = await client.translate(SAMPLE_REQUEST);
  expect(calls).toBe(1);
  expect(result.translations.map((row) => row.id)).toEqual(["greet", "score"]);
});
