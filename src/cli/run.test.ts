import { afterEach, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createTempDirTracker } from "../testing/temp-dir.ts";
import { TRANSLATION_ENV } from "../translation/config/schema.ts";
import type { FetchLike } from "../translation/http/openai-compatible-client.ts";
import {
  SAMPLE_REQUEST,
  VALID_TRANSLATIONS_JSON,
  completionEnvelope,
  completionForItems,
  itemsFromOutboundBody,
} from "../translation/http/fixtures/completions.ts";
import { CLINE_FREE_MODEL } from "../translation/providers/cline-free/contract.ts";
import { runCli } from "./run.ts";

const tempDirs = createTempDirTracker();
afterEach(() => tempDirs.cleanup());

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write(text: string) { stdout += text; } },
    stderr: { write(text: string) { stderr += text; } },
    read() {
      return { stdout, stderr };
    },
  };
}

test("prints usage with no arguments", async () => {
  const io = capture();
  const code = await runCli([], { env: {}, ...io });
  expect(code).toBe(0);
  expect(io.read().stdout).toContain("bun run start translate");
});

test("rejects an unknown command", async () => {
  const io = capture();
  const code = await runCli(["pack"], { env: {}, ...io });
  expect(code).toBe(1);
  expect(io.read().stderr).toContain("Unknown command: pack");
});

test("dry-run prints a redacted Cline payload with thinking disabled", async () => {
  const io = capture();
  const code = await runCli(
    ["translate", "--dry-run", "--id", "greet", "--text", "Hello, {name}!", "--placeholder", "{name}"],
    { env: { [TRANSLATION_ENV.API_KEY]: "super-secret-token" }, ...io },
  );
  expect(code).toBe(0);
  const printed = JSON.parse(io.read().stdout) as {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  expect(printed.url).toBe("https://api.cline.bot/api/v1/chat/completions");
  expect(printed.headers.Authorization).toBe("[redacted]");
  expect(printed.body.model).toBe(CLINE_FREE_MODEL);
  expect(printed.body.include_reasoning).toBe(true);
  expect(printed.body.reasoning).toEqual({ effort: "none" });
  expect(printed.body).not.toHaveProperty("reasoning_effort");
  expect(io.read().stdout.includes("super-secret-token")).toBe(false);
});

test("refuses a live translate when the API key is missing", async () => {
  const io = capture();
  let calls = 0;
  const fetchLike: FetchLike = async () => {
    calls += 1;
    return Response.json(completionEnvelope(VALID_TRANSLATIONS_JSON));
  };
  const code = await runCli(
    ["translate", "--id", "greet", "--text", "Hello"],
    { env: {}, fetch: fetchLike, ...io },
  );
  expect(code).toBe(1);
  expect(calls).toBe(0);
  expect(io.read().stderr).toContain("FORCE_TRANSLATION_API_KEY is required");
});

test("prints worker pool help instead of an HTTP timeout", async () => {
  const io = capture();
  const code = await runCli(["-h"], { env: {}, ...io });
  expect(code).toBe(0);
  expect(io.read().stdout).toContain("FORCE_TRANSLATION_WORKERS");
  expect(io.read().stdout).toContain("FORCE_TRANSLATION_TIMEOUT_MS is ignored");
});

test("CLI live translate uses the worker pool for independent items", async () => {
  const io = capture();
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  let releaseHold: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  let markReachedTwo: (() => void) | undefined;
  const reachedTwo = new Promise<void>((resolve) => {
    markReachedTwo = resolve;
  });
  const fetchLike: FetchLike = async (_url, init) => {
    calls += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (inFlight === 2) {
      markReachedTwo?.();
    }
    const items = itemsFromOutboundBody(init.body);
    await hold;
    inFlight -= 1;
    return Response.json(completionForItems(items));
  };
  const running = runCli(
    [
      "translate",
      "--id", "id-0", "--text", "one",
      "--id", "id-1", "--text", "two",
      "--id", "id-2", "--text", "three",
      "--id", "id-3", "--text", "four",
    ],
    {
      env: {
        [TRANSLATION_ENV.API_KEY]: "raw-token",
        [TRANSLATION_ENV.WORKERS]: "2",
        [TRANSLATION_ENV.BATCH_SIZE]: "1",
      },
      fetch: fetchLike,
      ...io,
    },
  );
  await reachedTwo;
  expect(maxInFlight).toBe(2);
  expect(calls).toBe(2);
  if (releaseHold === undefined) {
    throw new Error("worker pool never started");
  }
  releaseHold();
  const code = await running;
  expect(code).toBe(0);
  expect(calls).toBe(4);
  expect(maxInFlight).toBe(2);
  expect(JSON.parse(io.read().stdout)).toEqual({
    translations: [
      { id: "id-0", text: "ar:id-0" },
      { id: "id-1", text: "ar:id-1" },
      { id: "id-2", text: "ar:id-2" },
      { id: "id-3", text: "ar:id-3" },
    ],
  });
});

test("translate returns validated JSON through the CLI", async () => {
  const io = capture();
  const fetchLike: FetchLike = async () => Response.json(completionEnvelope(VALID_TRANSLATIONS_JSON));
  const code = await runCli(
    [
      "translate",
      "--id",
      SAMPLE_REQUEST.items[0]?.id ?? "greet",
      "--text",
      SAMPLE_REQUEST.items[0]?.text ?? "",
      "--id",
      SAMPLE_REQUEST.items[1]?.id ?? "score",
      "--text",
      SAMPLE_REQUEST.items[1]?.text ?? "",
      "--placeholder",
      "{name}",
      "--placeholder",
      "%s",
    ],
    { env: { [TRANSLATION_ENV.API_KEY]: "raw-token" }, fetch: fetchLike, ...io },
  );
  expect(code).toBe(0);
  expect(JSON.parse(io.read().stdout)).toEqual({
    translations: [
      { id: "greet", text: "مرحبا، {name}!" },
      { id: "score", text: "النتيجة: %s" },
    ],
  });
});

function extractedRecord(id: string, text: string, entryType = "StringTable") {
  return {
    archiveHeader: "/game/Win/Packs/Man_Trivial.~h",
    archivePayload: "/game/Win/Packs/Man_Trivial.~p",
    entryName: entryType === "StringTable" ? "stringtable/brutallegend" : "journal/foo",
    entryType,
    entryIndex: 1,
    payloadOffset: 0,
    storedSize: 1,
    contentSize: 1,
    recordId: id,
    text,
    sourceByteOffset: 8,
    extra: {},
  };
}

async function writeExtracted(records: unknown[]): Promise<{ input: string; out: string }> {
  const dir = await tempDirs.create("force-cli-file-");
  const input = path.join(dir, "strings.json");
  await writeFile(input, `${JSON.stringify(records)}\n`);
  return { input, out: path.join(dir, "out") };
}

test("file-mode plan prints counts and does not call fetch", async () => {
  const io = capture();
  let calls = 0;
  const { input, out } = await writeExtracted([
    extractedRecord("LINE001", "Press /Activate/"),
    extractedRecord("LINE002", "Hello"),
    extractedRecord("LINE001", "Press /Activate/", "JournalEntries"),
  ]);
  const code = await runCli(
    ["translate", "--input", input, "--out", out, "--plan"],
    { env: {}, fetch: async () => { calls += 1; return new Response("no"); }, ...io },
  );
  expect(code).toBe(0);
  expect(calls).toBe(0);
  expect(io.read().stdout).toContain("items 2");
  expect(io.read().stdout).toContain("batches 1");
  expect(io.read().stdout).toContain("workers 100");
  expect(io.read().stdout).toContain("batchSize 50");
  expect(io.read().stdout).toContain("/Activate/");
  expect(io.read().stdout).toContain(path.join(out, "status.json"));
});

test("file-mode live translate persists batches through the CLI without a nested pool", async () => {
  const io = capture();
  const { input, out } = await writeExtracted([
    extractedRecord("LINE001", "One"),
    extractedRecord("LINE002", "Two"),
    extractedRecord("LINE003", "Three"),
  ]);
  let calls = 0;
  let maxItems = 0;
  const fetchLike: FetchLike = async (_url, init) => {
    calls += 1;
    const items = itemsFromOutboundBody(init.body);
    maxItems = Math.max(maxItems, items.length);
    return Response.json(completionForItems(items));
  };
  const code = await runCli(
    ["translate", "--input", input, "--out", out],
    {
      env: {
        [TRANSLATION_ENV.API_KEY]: "raw-token",
        [TRANSLATION_ENV.WORKERS]: "100",
        [TRANSLATION_ENV.BATCH_SIZE]: "50",
      },
      fetch: fetchLike,
      ...io,
    },
  );
  expect(code).toBe(0);
  expect(calls).toBe(1);
  expect(maxItems).toBe(3);
  const assembled = JSON.parse(await Bun.file(path.join(out, "translations.json")).text()) as {
    translations: { id: string }[];
  };
  expect(assembled.translations.map((row) => row.id)).toEqual(["LINE001", "LINE002", "LINE003"]);
});

test("patch help mentions stage apply restore and confirm", async () => {
  const io = capture();
  const code = await runCli(["patch", "-h"], { env: {}, ...io });
  expect(code).toBe(0);
  expect(io.read().stdout).toContain("patch stage");
  expect(io.read().stdout).toContain("patch apply");
  expect(io.read().stdout).toContain("--confirm");
  expect(io.read().stdout).toContain("not modify the installed game");
});

test("file-mode help mentions --input and --resume", async () => {
  const io = capture();
  const code = await runCli(["translate", "-h"], { env: {}, ...io });
  expect(code).toBe(0);
  expect(io.read().stdout).toContain("--input");
  expect(io.read().stdout).toContain("--resume");
  expect(io.read().stdout).toContain("--plan");
  expect(io.read().stdout).toContain("promptHash");
  expect(io.read().stdout).toContain("invalid JSON");
  expect(io.read().stdout).toContain("unresolved.json");
});
