import { expect, test } from "bun:test";
import { TranslationError, TranslationHttpError } from "../errors.ts";
import { createOpenAiCompatibleClient, type FetchLike } from "./openai-compatible-client.ts";
import { buildTranslationUserPayload } from "../prompts/user-payload.ts";
import {
  MISSING_ID_JSON,
  SAMPLE_REQUEST,
  VALID_TRANSLATIONS_JSON,
  completionEnvelope,
} from "./fixtures/completions.ts";

function settings() {
  return {
    baseUrl: "https://llm.example.test/v1",
    model: "vendor/model",
    apiKey: "generic-secret",
    maxRetries: 2,
    retryBackoffMs: 5,
    temperature: 0,
    workers: 100,
    batchSize: 50,
    headers: { "X-Test": "1" },
    extraBody: { seed: 1 },
  };
}

test("sends the exact generic outbound payload and returns validated translations", async () => {
  let calls = 0;
  const fetchLike: FetchLike = async (url, init) => {
    calls += 1;
    expect(url).toBe("https://llm.example.test/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer generic-secret");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-test")).toBe("1");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("vendor/model");
    expect(body.temperature).toBe(0);
    expect(body.seed).toBe(1);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body).not.toHaveProperty("include_reasoning");
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages[0].role).toBe("system");
    expect(String(body.messages[0].content)).toContain("Target language: ar");
    expect(body.messages[1]).toEqual({
      role: "user",
      content: JSON.stringify(buildTranslationUserPayload(SAMPLE_REQUEST)),
    });
    expect(init.signal).toBeUndefined();
    return Response.json(completionEnvelope(VALID_TRANSLATIONS_JSON));
  };

  const client = createOpenAiCompatibleClient(settings(), { fetch: fetchLike });
  const result = await client.translate(SAMPLE_REQUEST);
  expect(calls).toBe(1);
  expect(result.translations[0]?.id).toBe("greet");
});

test("does not retry HTTP 401 and omits response bodies from the error", async () => {
  const fetchLike: FetchLike = async () =>
    new Response(JSON.stringify({ error: "generic-secret leaked" }), { status: 401 });
  const client = createOpenAiCompatibleClient(settings(), { fetch: fetchLike });
  try {
    await client.translate(SAMPLE_REQUEST);
    throw new Error("expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(TranslationHttpError);
    expect(error instanceof TranslationHttpError && error.status).toBe(401);
    expect(error instanceof Error && error.message).toBe("Translation request failed (HTTP 401)");
    expect(error instanceof Error && error.message.includes("generic-secret")).toBe(false);
  }
});

test("retries retryable HTTP statuses with bounded backoff, then succeeds", async () => {
  const delays: number[] = [];
  let calls = 0;
  const fetchLike: FetchLike = async () => {
    calls += 1;
    if (calls < 3) {
      return new Response("unavailable", { status: 503 });
    }
    return Response.json(completionEnvelope(VALID_TRANSLATIONS_JSON));
  };
  const client = createOpenAiCompatibleClient(settings(), {
    fetch: fetchLike,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  await client.translate(SAMPLE_REQUEST);
  expect(calls).toBe(3);
  expect(delays).toEqual([5, 10]);
});

test("uses Retry-After seconds instead of exponential backoff", async () => {
  const delays: number[] = [];
  let calls = 0;
  const fetchLike: FetchLike = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("slow down", { status: 429, headers: { "Retry-After": "2" } });
    }
    return Response.json(completionEnvelope(VALID_TRANSLATIONS_JSON));
  };
  const client = createOpenAiCompatibleClient(settings(), {
    fetch: fetchLike,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  await client.translate(SAMPLE_REQUEST);
  expect(calls).toBe(2);
  expect(delays).toEqual([2000]);
});

test("retries HTTP 529, then succeeds", async () => {
  let calls = 0;
  const fetchLike: FetchLike = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("overloaded", { status: 529 });
    }
    return Response.json(completionEnvelope(VALID_TRANSLATIONS_JSON));
  };
  const client = createOpenAiCompatibleClient(settings(), {
    fetch: fetchLike,
    sleep: async () => {},
  });
  await client.translate(SAMPLE_REQUEST);
  expect(calls).toBe(2);
});

test("exhausts retries on repeated HTTP 503", async () => {
  let calls = 0;
  const fetchLike: FetchLike = async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  };
  const client = createOpenAiCompatibleClient(settings(), {
    fetch: fetchLike,
    sleep: async () => {},
  });
  await expect(client.translate(SAMPLE_REQUEST)).rejects.toMatchObject({ status: 503, retryable: true });
  expect(calls).toBe(3);
});

test("retries a network failure, then reports a secret-free error", async () => {
  let calls = 0;
  const fetchLike: FetchLike = async () => {
    calls += 1;
    throw new TypeError("fetch failed for generic-secret");
  };
  const client = createOpenAiCompatibleClient({ ...settings(), maxRetries: 1 }, {
    fetch: fetchLike,
    sleep: async () => {},
  });
  try {
    await client.translate(SAMPLE_REQUEST);
    throw new Error("expected failure");
  } catch (error) {
    expect(calls).toBe(2);
    expect(error).toBeInstanceOf(TranslationError);
    expect(error instanceof Error && error.message.includes("generic-secret")).toBe(false);
    expect(error instanceof Error && error.message.includes("[redacted]")).toBe(true);
  }
});

test("cancels before a request is sent", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const client = createOpenAiCompatibleClient(settings(), {
    fetch: async () => {
      calls += 1;
      return Response.json(completionEnvelope(VALID_TRANSLATIONS_JSON));
    },
  });
  await expect(client.translate(SAMPLE_REQUEST, { signal: controller.signal })).rejects.toMatchObject({
    code: "CANCELLED",
  });
  expect(calls).toBe(0);
});

test("cancels while waiting to retry", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = createOpenAiCompatibleClient(settings(), {
    fetch: async () => {
      calls += 1;
      return new Response("unavailable", { status: 503 });
    },
    sleep: async (_ms, signal) => {
      controller.abort();
      signal?.throwIfAborted();
    },
  });
  await expect(client.translate(SAMPLE_REQUEST, { signal: controller.signal })).rejects.toMatchObject({
    code: "CANCELLED",
  });
  expect(calls).toBe(1);
});

test("rejects a successful HTTP response with missing translation ids", async () => {
  const client = createOpenAiCompatibleClient(settings(), {
    fetch: async () => Response.json(completionEnvelope(MISSING_ID_JSON)),
  });
  await expect(client.translate(SAMPLE_REQUEST)).rejects.toMatchObject({
    code: "RESPONSE",
    message: expect.stringContaining("missing ids: score"),
  });
});

test("does not attach an automatic request deadline", async () => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let startedResolve: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });
  const client = createOpenAiCompatibleClient(
    { ...settings(), maxRetries: 0 },
    {
      fetch: async (_url, init) => {
        startedResolve?.();
        await held;
        expect(init.signal).toBeUndefined();
        return Response.json(completionEnvelope(VALID_TRANSLATIONS_JSON));
      },
    },
  );
  const pending = client.translate(SAMPLE_REQUEST);
  let settled = false;
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await started;
  await Bun.sleep(40);
  expect(settled).toBe(false);
  if (release === undefined) {
    throw new Error("held request never started");
  }
  release();
  const result = await pending;
  expect(settled).toBe(true);
  expect(result.translations).toHaveLength(2);
});
