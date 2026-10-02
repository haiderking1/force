import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/** Create one tracker per test file and await cleanup in afterEach. */
export function createTempDirTracker() {
  const directories = new Set<string>();

  return {
    async create(prefix: string): Promise<string> {
      const directory = await mkdtemp(path.join(tmpdir(), prefix));
      directories.add(directory);
      return directory;
    },

    async cleanup(): Promise<void> {
      const results = await Promise.allSettled(
        [...directories].map(async (directory) => {
          await rm(directory, { recursive: true, force: true });
          directories.delete(directory);
        }),
      );
      const errors: unknown[] = [];
      for (const result of results) {
        if (result.status === "rejected") errors.push(result.reason);
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, "Failed to remove test temporary directories");
      }
    },
  };
}
