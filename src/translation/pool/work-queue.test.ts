import { expect, test } from "bun:test";
import { createWorkQueue } from "./work-queue.ts";

test("waiting workers pick up enqueued recovery jobs without nested fanout", async () => {
  const queue = createWorkQueue<string>(["a"]);
  const seen: string[] = [];
  let maxInFlight = 0;
  let inFlight = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const claimed = await queue.take();
      if (claimed === undefined) {
        return;
      }
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        seen.push(claimed.value);
        if (claimed.value === "a") {
          queue.enqueue("b");
          queue.enqueue("c");
        }
      } finally {
        inFlight -= 1;
        queue.release();
      }
    }
  };

  await Promise.all([worker(), worker(), worker()]);
  expect(seen.sort()).toEqual(["a", "b", "c"]);
  expect(maxInFlight).toBeLessThanOrEqual(3);
});

test("stop drops queued work and wakes waiters", async () => {
  const queue = createWorkQueue<string>(["a"]);
  const claimed = await queue.take();
  expect(claimed?.value).toBe("a");
  const waiting = queue.take();
  queue.stop();
  expect(await waiting).toBeUndefined();
  queue.enqueue("late");
  expect(await queue.take()).toBeUndefined();
  queue.release();
});
