import { afterEach, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTempDirTracker } from "../../testing/temp-dir.ts";
import { itemFileName } from "../checkpoint/paths.ts";
import { planCorpus } from "../corpus/plan.ts";
import type { CorpusItem } from "../corpus/types.ts";
import { TranslationError, TranslationHttpError } from "../errors.ts";
import { createOpenAiCompatibleClient } from "../http/openai-compatible-client.ts";
import { completionForItems, itemsFromOutboundBody } from "../http/fixtures/completions.ts";
import { SAME_INPUT_RETRY_LIMIT, SINGLETON_REPAIR_LIMIT } from "../recovery/policy.ts";
import type { TranslateOptions, TranslateRequest, TranslateResult, TranslationClient } from "../types.ts";
import { runCorpusJob } from "./run.ts";

const tempDirs = createTempDirTracker();
afterEach(() => tempDirs.cleanup());

function item(id: string, text: string): CorpusItem {
  return {
    id,
    text,
    source: {
      archiveHeader: "/game/a.~h",
      archivePayload: "/game/a.~p",
      entryName: "stringtable/x",
      entryType: "StringTable",
      entryIndex: 0,
      payloadOffset: 0,
      storedSize: 1,
      contentSize: 1,
      recordId: id,
      sourceByteOffset: 0,
      extra: {},
    },
  };
}

function planFor(texts: readonly CorpusItem[], overrides: { workers?: number; batchSize?: number } = {}) {
  return planCorpus({
    items: texts,
    targetLanguage: "ar",
    provider: "cline-free",
    model: "cline-free/deepseek-v4.1-flash",
    baseUrl: "https://api.cline.bot/api/v1",
    temperature: 0,
    batchSize: overrides.batchSize ?? 2,
    workers: overrides.workers ?? 2,
  });
}

function fakeClient(
  translateBatch: (request: TranslateRequest, options: TranslateOptions) => Promise<TranslateResult>,
): TranslationClient {
  return {
    buildOutbound() {
      return { url: "https://example.test/v1/chat/completions", method: "POST", headers: {}, body: {} };
    },
    async translate() {
      throw new Error("client.translate must not be used for file mode");
    },
    translateBatch,
  };
}

function capture() {
  let stdout = "";
  return {
    stdout: { write(text: string) { stdout += text; } },
    read() {
      return stdout;
    },
  };
}

async function tempOut(): Promise<string> {
  return tempDirs.create("force-job-");
}

test("keeps successful batches after a later failure and resumes only the failed work", async () => {
  const outDir = await tempOut();
  const plan = planFor([item("a", "One /Activate/"), item("b", "Two"), item("c", "Three"), item("d", "Four")]);
  const seen: string[][] = [];
  const io = capture();
  const first = fakeClient(async (request) => {
    seen.push(request.items.map((row) => row.id));
    if (request.items.some((row) => row.id === "c")) {
      throw new TranslationError("RESPONSE", "Translation response is missing ids: c");
    }
    return {
      translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id} ${row.text.includes("/Activate/") ? "/Activate/" : ""}`.trim() })),
    };
  });
  const result = await runCorpusJob({ plan, outDir, resume: false, client: first, io });
  expect(result.done).toBe(3);
  expect(result.failed).toBe(1);
  expect(result.unresolved).toBe(1);
  expect(result.stoppedReason).toBe("incomplete");
  const assembled = JSON.parse(await readFile(path.join(outDir, "translations.json"), "utf8")) as {
    translations: { id: string }[];
  };
  expect(assembled.translations.map((row) => row.id)).toEqual(["a", "b", "d"]);

  const secondSeen: string[][] = [];
  const second = fakeClient(async (request) => {
    secondSeen.push(request.items.map((row) => row.id));
    return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
  });
  const resumed = await runCorpusJob({ plan, outDir, resume: true, client: second, io: capture() });
  expect(secondSeen).toEqual([["c"]]);
  expect(resumed.done).toBe(4);
  expect(resumed.failed).toBe(0);
  const done = JSON.parse(await readFile(path.join(outDir, "translations.json"), "utf8")) as {
    translations: { id: string; sourceText: string }[];
  };
  expect(done.translations.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  expect(done.translations[0]?.sourceText).toBe("One /Activate/");
});

test("changed source text or model settings refuse resume", async () => {
  const outDir = await tempOut();
  const plan = planFor([item("a", "One"), item("b", "Two")]);
  await runCorpusJob({
    plan,
    outDir,
    resume: false,
    client: fakeClient(async (request) => ({
      translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })),
    })),
    io: capture(),
  });
  const changedSource = planFor([item("a", "Uno"), item("b", "Two")]);
  await expect(
    runCorpusJob({
      plan: changedSource,
      outDir,
      resume: true,
      client: fakeClient(async () => ({ translations: [] })),
      io: capture(),
    }),
  ).rejects.toThrow(/identity does not match/);
  const changedModel = planCorpus({
    items: [item("a", "One"), item("b", "Two")],
    targetLanguage: "ar",
    provider: "cline-free",
    model: "other-model",
    baseUrl: "https://api.cline.bot/api/v1",
    temperature: 0,
    batchSize: 2,
    workers: 2,
  });
  await expect(
    runCorpusJob({
      plan: changedModel,
      outDir,
      resume: true,
      client: fakeClient(async () => ({ translations: [] })),
      io: capture(),
    }),
  ).rejects.toThrow(/identity does not match/);
});

test("missing or duplicate result ids fail the batch and do not count as success", async () => {
  const outDir = await tempOut();
  const plan = planFor([item("a", "One"), item("b", "Two")], { batchSize: 2, workers: 1 });
  const result = await runCorpusJob({
    plan,
    outDir,
    resume: false,
    client: fakeClient(async (request) => {
      if (request.items.length === 1 && request.items[0]?.id === "a") {
        return { translations: [{ id: "a", text: "ar:a" }] };
      }
      return { translations: [{ id: "a", text: "ar:a" }] };
    }),
    io: capture(),
  });
  expect(result.done).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.unresolved).toBe(1);
  const assembled = JSON.parse(await readFile(path.join(outDir, "translations.json"), "utf8")) as {
    translations: { id: string }[];
  };
  expect(assembled.translations.map((row) => row.id)).toEqual(["a"]);

  const outDir2 = await tempOut();
  const dup = await runCorpusJob({
    plan,
    outDir: outDir2,
    resume: false,
    client: fakeClient(async () => ({
      translations: [
        { id: "a", text: "ar:a" },
        { id: "a", text: "dup" },
      ],
    })),
    io: capture(),
  });
  expect(dup.done).toBe(0);
  expect(dup.failed).toBe(2);
});

test("rejects a translation that drops placeholders or source text", async () => {
  const outDir = await tempOut();
  const plan = planFor([item("a", "Press /Activate/"), item("b", "Keep me")], { batchSize: 1, workers: 1 });
  const result = await runCorpusJob({
    plan,
    outDir,
    resume: false,
    client: fakeClient(async (request) => {
      const first = request.items[0];
      if (first?.id === "a") {
        return { translations: [{ id: "a", text: "Press" }] };
      }
      return { translations: [{ id: "b", text: "" }] };
    }),
    io: capture(),
  });
  expect(result.done).toBe(0);
  expect(result.failed).toBe(2);
});

test("runs 100 concurrent batch requests without nested fanout", async () => {
  const items = Array.from({ length: 120 }, (_, index) => item(`id-${index}`, `text ${index}`));
  const plan = planFor(items, { workers: 100, batchSize: 1 });
  let inFlight = 0;
  let maxInFlight = 0;
  let translateCalls = 0;
  let batchCalls = 0;
  let release = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = () => {};
  const sawHundred = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const client: TranslationClient = {
    buildOutbound() {
      return { url: "https://example.test", method: "POST", headers: {}, body: {} };
    },
    async translate() {
      translateCalls += 1;
      throw new Error("nested client.translate");
    },
    async translateBatch(request) {
      batchCalls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (inFlight === 100) {
        reached();
      }
      try {
        await hold;
        return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
      } finally {
        inFlight -= 1;
      }
    },
  };
  const pending = runCorpusJob({ plan, outDir: await tempOut(), resume: false, client, io: capture() });
  await sawHundred;
  expect(maxInFlight).toBe(100);
  expect(batchCalls).toBe(100);
  expect(translateCalls).toBe(0);
  release();
  const result = await pending;
  expect(result.done).toBe(120);
  expect(maxInFlight).toBe(100);
  expect(batchCalls).toBe(120);
  expect(translateCalls).toBe(0);
});

test("auth failure stops dispatch and leaves remaining batches resumable", async () => {
  const items = Array.from({ length: 6 }, (_, index) => item(`id-${index}`, `text ${index}`));
  const plan = planFor(items, { workers: 2, batchSize: 1 });
  let started = 0;
  const startedIds: string[] = [];
  const client = fakeClient(async (request) => {
    started += 1;
    const id = request.items[0]?.id ?? "";
    startedIds.push(id);
    if (id === "id-0") {
      throw new TranslationHttpError(401, false);
    }
    await Bun.sleep(20);
    return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
  });
  const result = await runCorpusJob({ plan, outDir: await tempOut(), resume: false, client, io: capture() });
  expect(result.stoppedReason).toBe("auth");
  expect(started).toBeLessThan(6);
  expect(startedIds).toContain("id-0");
  expect(result.done + result.failed + result.pending).toBe(6);
  expect(result.pending).toBeGreaterThan(0);
});

test("quota failure 402 stops dispatch and never recovers into more requests", async () => {
  const items = Array.from({ length: 6 }, (_, index) => item(`id-${index}`, `text ${index}`));
  const plan = planFor(items, { workers: 2, batchSize: 1 });
  let started = 0;
  const client = fakeClient(async (request) => {
    started += 1;
    if (request.items[0]?.id === "id-0") {
      throw new TranslationHttpError(402, false);
    }
    await Bun.sleep(20);
    return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
  });
  const result = await runCorpusJob({ plan, outDir: await tempOut(), resume: false, client, io: capture() });
  expect(result.stoppedReason).toBe("auth");
  expect(started).toBeLessThan(6);
  expect(result.pending).toBeGreaterThan(0);
});

test("cancellation aborts in-flight work, persists successes, and leaves the rest pending", async () => {
  const items = Array.from({ length: 6 }, (_, index) => item(`id-${index}`, `text ${index}`));
  const plan = planFor(items, { workers: 2, batchSize: 1 });
  const controller = new AbortController();
  let started = 0;
  let releaseSecond = () => {};
  const secondStarted = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  const client = fakeClient(async (request, options) => {
    started += 1;
    const id = request.items[0]?.id;
    if (id === "id-0") {
      return { translations: [{ id: "id-0", text: "ar:id-0" }] };
    }
    if (started === 2) {
      releaseSecond();
    }
    const signal = options.signal;
    if (signal?.aborted) {
      throw new TranslationError("CANCELLED", "Translation request was cancelled");
    }
    await new Promise<never>((_, reject) => {
      const fail = () => {
        reject(new TranslationError("CANCELLED", "Translation request was cancelled"));
      };
      if (signal?.aborted) {
        fail();
        return;
      }
      signal?.addEventListener("abort", fail, { once: true });
      if (signal?.aborted) {
        fail();
      }
    });
    throw new TranslationError("CANCELLED", "Translation request was cancelled");
  });
  const outDir = await tempOut();
  const pending = runCorpusJob({ plan, outDir, resume: false, client, signal: controller.signal, io: capture() });
  await secondStarted;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  expect(started).toBeLessThan(6);
  const assembled = JSON.parse(await readFile(path.join(outDir, "translations.json"), "utf8")) as {
    translations: { id: string }[];
  };
  expect(assembled.translations.map((row) => row.id)).toContain("id-0");
  const status = JSON.parse(await readFile(path.join(outDir, "status.json"), "utf8")) as { stoppedReason: string };
  expect(status.stoppedReason).toBe("cancelled");
});

test("ignores leftover tmp batch files and refuses a corrupt completed batch", async () => {
  const outDir = await tempOut();
  const plan = planFor([item("a", "One"), item("b", "Two"), item("c", "Three"), item("d", "Four")]);
  await runCorpusJob({
    plan,
    outDir,
    resume: false,
    client: fakeClient(async (request) => {
      if (request.items.some((row) => row.id === "c")) {
        throw new TranslationError("HTTP", "provider down");
      }
      return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
    }),
    io: capture(),
  });
  await writeFile(path.join(outDir, "batches", "000000.json.partial.tmp"), "{not-json", "utf8");
  const seen: string[][] = [];
  const resumed = await runCorpusJob({
    plan,
    outDir,
    resume: true,
    client: fakeClient(async (request) => {
      seen.push(request.items.map((row) => row.id));
      return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
    }),
    io: capture(),
  });
  expect(seen).toEqual([["c", "d"]]);
  expect(resumed.done).toBe(4);

  const broken = await tempOut();
  await runCorpusJob({
    plan,
    outDir: broken,
    resume: false,
    client: fakeClient(async (request) => ({
      translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })),
    })),
    io: capture(),
  });
  await writeFile(path.join(broken, "batches", "000000.json"), "{not-json", "utf8");
  await expect(
    runCorpusJob({
      plan,
      outDir: broken,
      resume: true,
      client: fakeClient(async () => ({ translations: [] })),
      io: capture(),
    }),
  ).rejects.toThrow(/corrupt/);
});

test("splits a mixed RESPONSE batch and salvages valid children", async () => {
  const outDir = await tempOut();
  const plan = planFor(
    [item("a", "One"), item("b", "Two"), item("c", "Three"), item("d", "Four")],
    { batchSize: 4, workers: 2 },
  );
  const seen: string[][] = [];
  const result = await runCorpusJob({
    plan,
    outDir,
    resume: false,
    client: fakeClient(async (request) => {
      const ids = request.items.map((row) => row.id);
      seen.push(ids);
      if (ids.includes("c") && ids.length > 1) {
        throw new TranslationError("RESPONSE", "Translation response is not valid JSON");
      }
      if (ids.includes("c")) {
        throw new TranslationError("RESPONSE", "Translation response is missing ids: c");
      }
      return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
    }),
    io: capture(),
  });
  expect(result.done).toBe(3);
  expect(result.failed).toBe(1);
  expect(result.unresolved).toBe(1);
  expect(result.stoppedReason).toBe("incomplete");
  const assembled = JSON.parse(await readFile(path.join(outDir, "translations.json"), "utf8")) as {
    translations: { id: string }[];
  };
  expect(assembled.translations.map((row) => row.id)).toEqual(["a", "b", "d"]);
  const unresolved = JSON.parse(await readFile(path.join(outDir, "unresolved.json"), "utf8")) as {
    items: { id: string }[];
  };
  expect(unresolved.items.map((row) => row.id)).toEqual(["c"]);
  expect(seen.some((ids) => ids.length === 4)).toBe(true);
  expect(seen.some((ids) => ids.length === 2)).toBe(true);
  expect(seen.some((ids) => ids.length === 1 && ids[0] === "d")).toBe(true);
});

test("bounds singleton repair and writes diagnostics once", async () => {
  const outDir = await tempOut();
  const plan = planFor([item("bad", "Nope")], { batchSize: 1, workers: 1 });
  let calls = 0;
  const io = capture();
  const result = await runCorpusJob({
    plan,
    outDir,
    resume: false,
    client: fakeClient(async () => {
      calls += 1;
      throw new TranslationError("RESPONSE", "Translation response is not valid JSON");
    }),
    io,
  });
  expect(calls).toBe(1 + SAME_INPUT_RETRY_LIMIT + SINGLETON_REPAIR_LIMIT);
  expect(result.done).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.unresolved).toBe(1);
  expect(result.stoppedReason).toBe("incomplete");
  expect(io.read()).toContain("unresolved bad after");
  const unresolved = JSON.parse(await readFile(path.join(outDir, "unresolved.json"), "utf8")) as {
    items: { id: string; attempts: number }[];
  };
  expect(unresolved.items).toEqual([
    expect.objectContaining({ id: "bad", attempts: 1 + SAME_INPUT_RETRY_LIMIT + SINGLETON_REPAIR_LIMIT }),
  ]);
});

test("keeps a successful child after sibling cancel and does not recall it on resume", async () => {
  const plan = planFor(
    [item("a", "One"), item("b", "Two"), item("c", "Three"), item("d", "Four")],
    { batchSize: 4, workers: 2 },
  );
  const controller = new AbortController();
  let releaseHold = () => {};
  const holding = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  const outDir = await tempOut();
  const first = fakeClient(async (request, options) => {
    const ids = request.items.map((row) => row.id);
    if (ids.length === 4 || (ids.includes("c") && ids.includes("d"))) {
      if (ids.length === 2) {
        releaseHold();
        const signal = options.signal;
        await new Promise<never>((_, reject) => {
          const fail = () => {
            reject(new TranslationError("CANCELLED", "Translation request was cancelled"));
          };
          if (signal?.aborted) {
            fail();
            return;
          }
          signal?.addEventListener("abort", fail, { once: true });
        });
      }
      throw new TranslationError("RESPONSE", "Translation response is not valid JSON");
    }
    return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
  });
  const pending = runCorpusJob({ plan, outDir, resume: false, client: first, signal: controller.signal, io: capture() });
  await holding;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  const assembled = JSON.parse(await readFile(path.join(outDir, "translations.json"), "utf8")) as {
    translations: { id: string }[];
  };
  expect(assembled.translations.map((row) => row.id)).toEqual(["a", "b"]);

  const seen: string[][] = [];
  const resumed = await runCorpusJob({
    plan,
    outDir,
    resume: true,
    client: fakeClient(async (request) => {
      seen.push(request.items.map((row) => row.id));
      return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
    }),
    io: capture(),
  });
  expect(seen).toEqual([["c", "d"]]);
  expect(resumed.done).toBe(4);
  expect(resumed.failed).toBe(0);
});

test("recovery subjobs stay inside the global 100 worker bound", async () => {
  const items = Array.from({ length: 40 }, (_, index) => item(`id-${index}`, `text ${index}`));
  const plan = planFor(items, { workers: 100, batchSize: 2 });
  let inFlight = 0;
  let maxInFlight = 0;
  let translateCalls = 0;
  const firstPass = new Set<string>();
  const client: TranslationClient = {
    buildOutbound() {
      return { url: "https://example.test", method: "POST", headers: {}, body: {} };
    },
    async translate() {
      translateCalls += 1;
      throw new Error("nested client.translate");
    },
    async translateBatch(request) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        const key = request.items.map((row) => row.id).join(",");
        if (!firstPass.has(key)) {
          firstPass.add(key);
          throw new TranslationError("RESPONSE", "Translation response is not valid JSON");
        }
        return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
      } finally {
        inFlight -= 1;
      }
    },
  };
  const result = await runCorpusJob({ plan, outDir: await tempOut(), resume: false, client, io: capture() });
  expect(result.done).toBe(40);
  expect(maxInFlight).toBeLessThanOrEqual(100);
  expect(translateCalls).toBe(0);
});

test("resume skips saved batch and item records", async () => {
  const outDir = await tempOut();
  const plan = planFor(
    [item("a", "One"), item("b", "Two"), item("c", "Three"), item("d", "Four")],
    { batchSize: 2, workers: 1 },
  );
  await runCorpusJob({
    plan,
    outDir,
    resume: false,
    client: fakeClient(async (request) => {
      if (request.items.some((row) => row.id === "c") && request.items.length > 1) {
        throw new TranslationError("RESPONSE", "Translation response is missing ids: c");
      }
      if (request.items.some((row) => row.id === "c")) {
        throw new TranslationError("RESPONSE", "Translation response is missing ids: c");
      }
      return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
    }),
    io: capture(),
  });
  const seen: string[][] = [];
  const resumed = await runCorpusJob({
    plan,
    outDir,
    resume: true,
    client: fakeClient(async (request) => {
      seen.push(request.items.map((row) => row.id));
      return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
    }),
    io: capture(),
  });
  expect(seen).toEqual([["c"]]);
  expect(resumed.done).toBe(4);
});

test("tampered item source or identity refuses resume", async () => {
  const outDir = await tempOut();
  const plan = planFor(
    [item("a", "One"), item("b", "Two"), item("c", "Three"), item("d", "Four")],
    { batchSize: 2, workers: 1 },
  );
  await runCorpusJob({
    plan,
    outDir,
    resume: false,
    client: fakeClient(async (request) => {
      if (request.items.some((row) => row.id === "c") && request.items.length > 1) {
        throw new TranslationError("RESPONSE", "Translation response is missing ids: c");
      }
      if (request.items.some((row) => row.id === "c")) {
        throw new TranslationError("RESPONSE", "Translation response is missing ids: c");
      }
      return { translations: request.items.map((row) => ({ id: row.id, text: `ar:${row.id}` })) };
    }),
    io: capture(),
  });
  const itemPath = path.join(outDir, "items", itemFileName("d"));
  const saved = JSON.parse(await readFile(itemPath, "utf8")) as { sourceText: string; identityHash: string };
  saved.sourceText = "changed";
  await writeFile(itemPath, `${JSON.stringify(saved)}\n`);
  await expect(
    runCorpusJob({
      plan,
      outDir,
      resume: true,
      client: fakeClient(async () => ({ translations: [] })),
      io: capture(),
    }),
  ).rejects.toThrow(/source text does not match|identity does not match/);
});

test("HTTP transport retries stay on one translateBatch and are not split", async () => {
  const plan = planFor([item("a", "One"), item("b", "Two")], { batchSize: 2, workers: 1 });
  let fetches = 0;
  const attempts = new Map<string, number>();
  const client = createOpenAiCompatibleClient(
    {
      baseUrl: "https://llm.example.test/v1",
      model: "vendor/model",
      apiKey: "generic-secret",
      maxRetries: 2,
      retryBackoffMs: 0,
      temperature: 0,
      workers: 1,
      batchSize: 2,
      headers: {},
      extraBody: {},
    },
    {
      fetch: async (_url, init) => {
        fetches += 1;
        const items = itemsFromOutboundBody(init.body);
        const key = items.map((row) => row.id).join(",");
        const n = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, n);
        return new Response("unavailable", { status: 503 });
      },
      sleep: async () => undefined,
    },
  );
  const result = await runCorpusJob({ plan, outDir: await tempOut(), resume: false, client, io: capture() });
  expect(fetches).toBe(3);
  expect(attempts.get("a,b")).toBe(3);
  expect(result.done).toBe(0);
  expect(result.failed).toBe(2);
  expect(result.unresolved).toBe(0);
});

test("RESPONSE recovery does not multiply an exhausted HTTP retry budget", async () => {
  const plan = planFor([item("a", "One"), item("b", "Two")], { batchSize: 2, workers: 1 });
  let fetches = 0;
  const attempts = new Map<string, number>();
  const client = createOpenAiCompatibleClient(
    {
      baseUrl: "https://llm.example.test/v1",
      model: "vendor/model",
      apiKey: "generic-secret",
      maxRetries: 2,
      retryBackoffMs: 0,
      temperature: 0,
      workers: 1,
      batchSize: 2,
      headers: {},
      extraBody: {},
    },
    {
      fetch: async (_url, init) => {
        fetches += 1;
        const items = itemsFromOutboundBody(init.body);
        const key = items.map((row) => row.id).join(",");
        const n = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, n);
        if (n <= 2) {
          return new Response("unavailable", { status: 503 });
        }
        if (n === 3 && key === "a,b") {
          return Response.json({ choices: [{ message: { role: "assistant", content: "not-json" } }] });
        }
        return Response.json(completionForItems(items));
      },
      sleep: async () => undefined,
    },
  );
  const result = await runCorpusJob({ plan, outDir: await tempOut(), resume: false, client, io: capture() });
  expect(attempts.get("a,b")).toBe(4);
  expect(fetches).toBe(4);
  expect(result.done).toBe(2);
  expect(result.failed).toBe(0);
});
