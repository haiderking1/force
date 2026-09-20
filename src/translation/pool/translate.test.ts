import { expect, test } from "bun:test";
import { TranslationHttpError, TranslationPoolError } from "../errors.ts";
import { createOpenAiCompatibleClient, type FetchLike } from "../http/openai-compatible-client.ts";
import {
  completionForItems,
  itemsFromOutboundBody,
  numberedRequest,
} from "../http/fixtures/completions.ts";
import type { SourceText } from "../types.ts";
import { DEFAULT_WORKERS } from "./settings.ts";

function settings(overrides: {
  workers?: number;
  batchSize?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
} = {}) {
  return {
    baseUrl: "https://llm.example.test/v1",
    model: "vendor/model",
    apiKey: "generic-secret",
    maxRetries: overrides.maxRetries ?? 0,
    retryBackoffMs: overrides.retryBackoffMs ?? 0,
    temperature: 0,
    workers: overrides.workers ?? DEFAULT_WORKERS,
    batchSize: overrides.batchSize ?? 1,
    headers: {},
    extraBody: {},
  };
}

type Deferred = {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (reason?: unknown) => void;
};

function deferred(): Deferred {
  let resolve = () => {};
  let reject = (_reason?: unknown) => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = () => {
      res();
    };
    reject = rej;
  });
  return { promise, resolve, reject };
}

function waitForAbort(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
      return;
    }
    signal?.addEventListener(
      "abort",
      () => {
        reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function respondFor(items: readonly SourceText[]): Response {
  return Response.json(completionForItems(items));
}

test("reaches 100 simultaneous requests and never exceeds that bound", async () => {
  const request = numberedRequest(120);
  const hold = deferred();
  const reached = deferred();
  let inFlight = 0;
  let maxInFlight = 0;
  const startedIds: string[] = [];
  const fetchLike: FetchLike = async (_url, init) => {
    const items = itemsFromOutboundBody(init.body);
    const first = items[0];
    if (first !== undefined) {
      startedIds.push(first.id);
    }
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (inFlight === 100) {
      reached.resolve();
    }
    try {
      await Promise.race([hold.promise, waitForAbort(init.signal)]);
    } finally {
      inFlight -= 1;
    }
    return respondFor(items);
  };

  const client = createOpenAiCompatibleClient(settings({ workers: 100, batchSize: 1 }), { fetch: fetchLike });
  const pending = client.translate(request);
  await reached.promise;
  expect(maxInFlight).toBe(100);
  expect(inFlight).toBe(100);
  expect(startedIds).toHaveLength(100);
  hold.resolve();
  const result = await pending;
  expect(maxInFlight).toBe(100);
  expect(result.translations).toHaveLength(120);
  expect(result.translations.map((row) => row.id)).toEqual(request.items.map((item) => item.id));
  expect(result.translations.map((row) => row.text)).toEqual(request.items.map((item) => `ar:${item.id}`));
});

test("never exceeds a lower configured worker limit while refilling immediately", async () => {
  const request = numberedRequest(6);
  const gates = new Map<string, Deferred>();
  const firstWave = deferred();
  const thirdStarted = deferred();
  let inFlight = 0;
  let maxInFlight = 0;
  let releaseRemaining = false;
  const fetchLike: FetchLike = async (_url, init) => {
    const items = itemsFromOutboundBody(init.body);
    const id = items[0]?.id;
    if (id === undefined) {
      throw new Error("missing item id");
    }
    const gate = deferred();
    gates.set(id, gate);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (gates.has("id-0") && gates.has("id-1") && inFlight === 2) {
      firstWave.resolve();
    }
    if (id === "id-2") {
      thirdStarted.resolve();
    }
    try {
      if (!releaseRemaining) {
        await Promise.race([gate.promise, waitForAbort(init.signal)]);
      }
    } finally {
      inFlight -= 1;
    }
    return respondFor(items);
  };

  const client = createOpenAiCompatibleClient(settings({ workers: 2, batchSize: 1 }), { fetch: fetchLike });
  const pending = client.translate(request);
  try {
    await firstWave.promise;
    expect(maxInFlight).toBe(2);
    expect(inFlight).toBe(2);
    expect(gates.has("id-0")).toBe(true);
    expect(gates.has("id-1")).toBe(true);

    const first = gates.get("id-0");
    if (first === undefined) {
      throw new Error("first job did not start");
    }
    first.resolve();
    await thirdStarted.promise;
    expect(maxInFlight).toBe(2);
    expect(inFlight).toBe(2);
    expect(gates.has("id-2")).toBe(true);
    expect(gates.has("id-3")).toBe(false);
    expect(gates.has("id-1")).toBe(true);

    releaseRemaining = true;
    for (const gate of gates.values()) {
      gate.resolve();
    }
    const result = await pending;
    expect(maxInFlight).toBe(2);
    expect(result.translations.map((row) => row.id)).toEqual(["id-0", "id-1", "id-2", "id-3", "id-4", "id-5"]);
  } finally {
    releaseRemaining = true;
    for (const gate of gates.values()) {
      gate.resolve();
    }
  }
});

test("maps results to source order when batches finish out of order", async () => {
  const request = numberedRequest(4);
  const gates = new Map<string, Deferred>();
  const started = deferred();
  const fetchLike: FetchLike = async (_url, init) => {
    const items = itemsFromOutboundBody(init.body);
    const id = items[0]?.id;
    if (id === undefined) {
      throw new Error("missing item id");
    }
    const gate = deferred();
    gates.set(id, gate);
    if (gates.size === 4) {
      started.resolve();
    }
    await gate.promise;
    return respondFor(items);
  };

  const client = createOpenAiCompatibleClient(settings({ workers: 4, batchSize: 1 }), { fetch: fetchLike });
  const pending = client.translate(request);
  await started.promise;
  for (const id of ["id-3", "id-1", "id-2", "id-0"]) {
    const gate = gates.get(id);
    if (gate === undefined) {
      throw new Error(`missing gate ${id}`);
    }
    gate.resolve();
  }
  const result = await pending;
  expect(result.translations.map((row) => row.id)).toEqual(["id-0", "id-1", "id-2", "id-3"]);
});

test("continues other batches after a permanent failure, then reports failed ids", async () => {
  const request = numberedRequest(3);
  const seen: string[] = [];
  const fetchLike: FetchLike = async (_url, init) => {
    const items = itemsFromOutboundBody(init.body);
    const id = items[0]?.id;
    if (id !== undefined) {
      seen.push(id);
    }
    if (id === "id-1") {
      return new Response("no", { status: 401 });
    }
    return respondFor(items);
  };

  const client = createOpenAiCompatibleClient(settings({ workers: 2, batchSize: 1 }), { fetch: fetchLike });
  try {
    await client.translate(request);
    throw new Error("expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(TranslationPoolError);
    expect(error instanceof TranslationPoolError && error.failedIds).toEqual(["id-1"]);
    expect(error instanceof TranslationHttpError).toBe(false);
  }
  expect(seen.sort()).toEqual(["id-0", "id-1", "id-2"]);
});

test("keeps retries on the same worker so concurrency stays bounded", async () => {
  const request = numberedRequest(2);
  let inFlight = 0;
  let maxInFlight = 0;
  let firstAttempts = 0;
  const delays: number[] = [];
  const fetchLike: FetchLike = async (_url, init) => {
    const items = itemsFromOutboundBody(init.body);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (items[0]?.id === "id-0") {
        firstAttempts += 1;
        if (firstAttempts < 3) {
          return new Response("unavailable", { status: 503 });
        }
      }
      return respondFor(items);
    } finally {
      inFlight -= 1;
    }
  };

  const client = createOpenAiCompatibleClient(
    settings({ workers: 1, batchSize: 1, maxRetries: 2, retryBackoffMs: 1 }),
    {
      fetch: fetchLike,
      sleep: async (ms) => {
        delays.push(ms);
        expect(inFlight).toBe(0);
      },
    },
  );
  const result = await client.translate(request);
  expect(firstAttempts).toBe(3);
  expect(maxInFlight).toBe(1);
  expect(delays).toEqual([1, 2]);
  expect(result.translations.map((row) => row.id)).toEqual(["id-0", "id-1"]);
});

test("stops queued jobs on cancellation and aborts active requests", async () => {
  const request = numberedRequest(8);
  const controller = new AbortController();
  const started = deferred();
  let calls = 0;
  let aborted = 0;
  const fetchLike: FetchLike = async (_url, init) => {
    calls += 1;
    if (calls === 2) {
      started.resolve();
    }
    try {
      await waitForAbort(init.signal);
      throw new Error("active request was not aborted");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        aborted += 1;
        throw error;
      }
      throw error;
    }
  };

  const client = createOpenAiCompatibleClient(settings({ workers: 2, batchSize: 1 }), { fetch: fetchLike });
  const pending = client.translate(request, { signal: controller.signal });
  await started.promise;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  expect(calls).toBe(2);
  expect(aborted).toBe(2);
});
