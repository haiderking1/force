import { TranslationError } from "../errors.ts";
import { isCancelledError, throwIfAborted } from "../http/retry.ts";
import { assertPoolLimits } from "./settings.ts";
import { createWorkQueue } from "./work-queue.ts";

export type WorkerFailure<T> = {
  readonly index: number;
  readonly job: T;
  readonly error: unknown;
};

export type WorkerSuccess<T, R> = {
  readonly index: number;
  readonly job: T;
  readonly result: R;
};

export type WorkerPoolOutcome<T, R> = {
  readonly results: readonly (R | undefined)[];
  readonly failures: readonly WorkerFailure<T>[];
  readonly unexpected: readonly unknown[];
  readonly cancelled: boolean;
  readonly stopped: boolean;
};

export type PoolController<T> = {
  enqueue(job: T): void;
};

export type WorkerPoolOptions<T, R> = {
  readonly workers: number;
  readonly jobs: readonly T[];
  readonly signal?: AbortSignal;
  readonly run: (job: T, signal: AbortSignal | undefined) => Promise<R>;
  readonly onSuccess?: (event: WorkerSuccess<T, R>, controller: PoolController<T>) => Promise<void> | void;
  readonly onFailure?: (event: WorkerFailure<T>, controller: PoolController<T>) => Promise<void> | void;
  readonly shouldStopDispatch?: (error: unknown) => boolean;
};

export async function runWorkerPool<T, R>(
  options: WorkerPoolOptions<T, R>,
): Promise<WorkerPoolOutcome<T, R>> {
  assertPoolLimits(options.workers, 1);
  const queue = createWorkQueue(options.jobs);
  const results: Array<R | undefined> = [];
  const failures: WorkerFailure<T>[] = [];
  const unexpected: unknown[] = [];
  let cancelled = false;
  let stopped = false;
  const controller: PoolController<T> = {
    enqueue(job) {
      queue.enqueue(job);
    },
  };

  const onAbort = (): void => {
    cancelled = true;
    queue.stop();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const worker = async (): Promise<void> => {
    for (;;) {
      if (options.signal?.aborted || cancelled || stopped) {
        if (options.signal?.aborted) {
          cancelled = true;
        }
        queue.stop();
        return;
      }
      const claimed = await queue.take();
      if (claimed === undefined) {
        return;
      }
      try {
        throwIfAborted(options.signal);
        const result = await options.run(claimed.value, options.signal);
        if (options.onSuccess !== undefined) {
          await options.onSuccess({ index: claimed.index, job: claimed.value, result }, controller);
        }
        results[claimed.index] = result;
      } catch (error) {
        if (isCancelledError(error) || options.signal?.aborted) {
          cancelled = true;
          queue.stop();
          return;
        }
        const failure = { index: claimed.index, job: claimed.value, error };
        failures.push(failure);
        if (options.onFailure !== undefined) {
          await options.onFailure(failure, controller);
        }
        if (options.shouldStopDispatch?.(error)) {
          stopped = true;
          queue.stop();
          return;
        }
        if (!(error instanceof TranslationError)) {
          return;
        }
      } finally {
        queue.release();
      }
    }
  };

  try {
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
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    queue.stop();
  }

  return {
    results,
    failures,
    unexpected,
    cancelled: cancelled || Boolean(options.signal?.aborted),
    stopped,
  };
}
