import { TranslationError } from "../errors.ts";
import { isCancelledError, throwIfAborted } from "../http/retry.ts";
import { createClaimQueue } from "./queue.ts";
import { assertPoolLimits } from "./settings.ts";

export type WorkerFailure<T> = {
  readonly index: number;
  readonly job: T;
  readonly error: unknown;
};

export type WorkerPoolOutcome<T, R> = {
  readonly results: readonly (R | undefined)[];
  readonly failures: readonly WorkerFailure<T>[];
  readonly unexpected: readonly unknown[];
  readonly cancelled: boolean;
};

export type WorkerPoolOptions<T, R> = {
  readonly workers: number;
  readonly jobs: readonly T[];
  readonly signal?: AbortSignal;
  readonly run: (job: T, signal: AbortSignal | undefined) => Promise<R>;
};

export async function runWorkerPool<T, R>(
  options: WorkerPoolOptions<T, R>,
): Promise<WorkerPoolOutcome<T, R>> {
  assertPoolLimits(options.workers, 1);
  const queue = createClaimQueue(options.jobs);
  const results: Array<R | undefined> = Array.from({ length: options.jobs.length });
  const failures: WorkerFailure<T>[] = [];
  const unexpected: unknown[] = [];
  let cancelled = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (options.signal?.aborted || cancelled) {
        cancelled = true;
        return;
      }
      const claimed = queue.claim();
      if (claimed === undefined) {
        return;
      }
      try {
        throwIfAborted(options.signal);
        results[claimed.index] = await options.run(claimed.value, options.signal);
      } catch (error) {
        if (isCancelledError(error) || options.signal?.aborted) {
          cancelled = true;
          return;
        }
        failures.push({ index: claimed.index, job: claimed.value, error });
        if (!(error instanceof TranslationError)) {
          return;
        }
      }
    }
  };

  const settled = await Promise.allSettled(
    Array.from({ length: options.workers }, () => worker()),
  );
  for (const entry of settled) {
    if (entry.status === "rejected") {
      if (isCancelledError(entry.reason) || options.signal?.aborted) {
        cancelled = true;
        continue;
      }
      unexpected.push(entry.reason);
    }
  }

  return {
    results,
    failures,
    unexpected,
    cancelled: cancelled || Boolean(options.signal?.aborted),
  };
}
