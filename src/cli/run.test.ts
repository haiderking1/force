import { expect, test } from "bun:test";
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
