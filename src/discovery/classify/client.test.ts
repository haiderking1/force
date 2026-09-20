import { expect, test } from "bun:test";
import { createJevClient } from "./client.ts";
import type { JevConfig } from "./config.ts";
import { ROLE_QUESTION_KEYS } from "./questions.ts";
import { JEV_EVALUATE_PATH } from "./contract.ts";

const config: JevConfig = {
  apiKey: "dummy-jev-key",
  baseUrl: "https://api.typesafe.ai",
  model: "jev-latest",
  maxRetries: 2,
  retryBackoffMs: 1,
  concurrency: 2,
};

function noulBody(): unknown {
  const answers: Record<string, { type: "noul"; noul: number }> = {};
  for (const key of ROLE_QUESTION_KEYS) {
    answers[key] = { type: "noul", noul: 0.25 };
  }
  return { model: "jev-1.13.0", answers };
}

test("retries transient statuses and does not attach an automatic abort deadline", async () => {
  const sleeps: number[] = [];
  let calls = 0;
  const client = createJevClient(config, {
    fetch: async (url, init) => {
      calls += 1;
      expect(url).toBe(`https://api.typesafe.ai${JEV_EVALUATE_PATH}`);
      expect(init.signal).toBeUndefined();
      expect("timeout" in init).toBe(false);
      if (calls === 1) {
        return new Response("nope", { status: 429, headers: { "Retry-After": "0" } });
      }
      return Response.json(noulBody());
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  const result = await client.evaluate({ resource: { id: "a" } });
  expect(calls).toBe(2);
  expect(sleeps).toEqual([0]);
  expect(result.resolvedModel).toBe("jev-1.13.0");
  expect(result.roles.playerVisibleUiText).toBe(0.25);
});

test("cancels without retrying and forwards only the caller signal", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const client = createJevClient(config, {
    fetch: async () => {
      calls += 1;
      return Response.json(noulBody());
    },
    sleep: async () => {
      throw new Error("should not sleep");
    },
  });
  await expect(client.evaluate({ resource: { id: "a" } }, controller.signal)).rejects.toThrow(/cancelled/);
  expect(calls).toBe(0);
});
