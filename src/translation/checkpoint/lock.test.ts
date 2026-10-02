import { afterEach, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createTempDirTracker } from "../../testing/temp-dir.ts";
import { acquireJobLock, isPidAlive, releaseJobLock } from "./lock.ts";

const tempDirs = createTempDirTracker();
afterEach(() => tempDirs.cleanup());

async function lockPath(): Promise<string> {
  const dir = await tempDirs.create("force-lock-");
  return path.join(dir, "lock.json");
}

test("acquires and releases a lock for the current process", async () => {
  const filePath = await lockPath();
  const lock = await acquireJobLock(filePath, "hash-1");
  expect(lock.pid).toBe(process.pid);
  expect(lock.identityHash).toBe("hash-1");
  await expect(acquireJobLock(filePath, "hash-1")).rejects.toThrow(/locked by pid/);
  await releaseJobLock(filePath);
  const again = await acquireJobLock(filePath, "hash-1");
  expect(again.pid).toBe(process.pid);
  await releaseJobLock(filePath);
});

test("treats a dead pid or corrupt lock as stale", async () => {
  const filePath = await lockPath();
  await writeFile(
    filePath,
    `${JSON.stringify({ pid: 999_999_999, startedAt: "2020-01-01T00:00:00.000Z", hostname: "test", identityHash: "old" })}\n`,
  );
  expect(isPidAlive(999_999_999)).toBe(false);
  const lock = await acquireJobLock(filePath, "hash-2");
  expect(lock.identityHash).toBe("hash-2");
  await releaseJobLock(filePath);

  const broken = await lockPath();
  await writeFile(broken, "{not-json", "utf8");
  const recovered = await acquireJobLock(broken, "hash-3");
  expect(recovered.identityHash).toBe("hash-3");
  await releaseJobLock(broken);
});
