import { assembleTranslations } from "../checkpoint/assemble.ts";
import { acquireJobLock, releaseJobLock } from "../checkpoint/lock.ts";
import { openCheckpointStore, type CheckpointStore } from "../checkpoint/store.ts";
import { createJobStatus, formatStatusLine, writeJobStatus } from "../checkpoint/status.ts";
import type { JobStatus, StoredUnresolvedItem } from "../checkpoint/types.ts";
import { createSerialQueue } from "../checkpoint/atomic.ts";
import { itemSourceHash } from "../checkpoint/items.ts";
import { identityFingerprint } from "../corpus/plan.ts";
import type { CorpusItem, CorpusPlan } from "../corpus/types.ts";
import { TranslationError } from "../errors.ts";
import { runWorkerPool } from "../pool/run.ts";
import { asCorpusBatch, initialRecoveryWork, type RecoveryWork } from "../recovery/jobs.ts";
import { decideRecovery, singletonAttemptCount } from "../recovery/policy.ts";
import { splitItems } from "../recovery/split.ts";
import { assertBatchPreserved } from "../tokens/preserve.ts";
import { errorDetail, fatalStopReason, isFatalDispatchError } from "./fatal.ts";
import type { CorpusJobOptions, CorpusJobResult } from "./types.ts";

type ProgressState = {
  active: number;
  activeItems: number;
  done: number;
  failed: number;
  unresolved: number;
  readonly startedAt: number;
  readonly identityHash: string;
  readonly total: number;
};

export async function runCorpusJob(options: CorpusJobOptions): Promise<CorpusJobResult> {
  const startedAt = (options.io.now ?? Date.now)();
  const identityHash = identityFingerprint(options.plan.identity);
  const { store, completedIds } = await openCheckpointStore(options.outDir, options.plan, options.resume);
  await acquireJobLock(store.paths.lock, identityHash);
  const pending = pendingWork(options.plan, completedIds);
  const state: ProgressState = {
    active: 0,
    activeItems: 0,
    done: completedIds.size,
    failed: 0,
    unresolved: 0,
    startedAt,
    identityHash,
    total: options.plan.items.length,
  };
  let fatalReason: "auth" | "config" | undefined;
  let cancelled = false;
  const publishSerial = createSerialQueue();
  try {
    await publish(options, store, state, "running", publishSerial);
    if (pending.length > 0) {
      const outcome = await runWorkerPool({
        workers: options.plan.workers,
        jobs: pending,
        signal: options.signal,
        shouldStopDispatch: isFatalDispatchError,
        run: async (work, signal) => {
          state.active += 1;
          state.activeItems += work.items.length;
          await publish(options, store, state, fatalReason ?? "running", publishSerial);
          try {
            const result = await options.client.translateBatch(
              {
                targetLanguage: options.plan.targetLanguage,
                placeholders: options.plan.placeholders,
                items: work.items.map((item) => ({ id: item.id, text: item.text })),
              },
              { signal },
            );
            assertBatchPreserved(
              work.items.map((item) => ({ id: item.id, text: item.text })),
              result.translations,
              options.plan.placeholders,
            );
            return result;
          } finally {
            state.active -= 1;
            state.activeItems -= work.items.length;
          }
        },
        onSuccess: async (event) => {
          await persistWorkSuccess(store, options.plan, event.job, event.result.translations);
          state.done += event.job.items.length;
          await publish(options, store, state, fatalReason ?? "running", publishSerial);
        },
        onFailure: async (event, controller) => {
          const reason = fatalStopReason(event.error);
          if (reason !== undefined) {
            fatalReason = reason;
            await store.persistFailure(asCorpusBatch(event.job), errorDetail(event.error));
            state.failed += event.job.items.length;
            await publish(options, store, state, fatalReason, publishSerial);
            return;
          }
          const decision = decideRecovery({
            error: event.error,
            itemCount: event.job.items.length,
            sameInputRetries: event.job.sameInputRetries,
            singletonRepairs: event.job.singletonRepairs,
          });
          if (decision === "retry-same") {
            controller.enqueue({
              ...event.job,
              sameInputRetries: event.job.sameInputRetries + 1,
            });
            return;
          }
          if (decision === "split") {
            const [left, right] = splitItems(event.job.items);
            if (left.length > 0) {
              controller.enqueue(initialRecoveryWork(event.job.originIndex, left));
            }
            if (right.length > 0) {
              controller.enqueue(initialRecoveryWork(event.job.originIndex, right));
            }
            return;
          }
          if (decision === "repair") {
            controller.enqueue({
              ...event.job,
              singletonRepairs: event.job.singletonRepairs + 1,
            });
            return;
          }
          if (decision === "unresolved") {
            const item = event.job.items[0];
            if (item === undefined) {
              throw new TranslationError("VALIDATION", "Recovery marked an empty job unresolved");
            }
            const detail = errorDetail(event.error);
            const attempts = singletonAttemptCount(event.job.sameInputRetries, event.job.singletonRepairs);
            const unresolved = toUnresolvedItem(event.job.originIndex, item, attempts, detail);
            await store.persistUnresolved(unresolved);
            state.failed += 1;
            state.unresolved += 1;
            options.io.stdout.write(`\n${unresolved.diagnostics}\n`);
            await publish(options, store, state, fatalReason ?? "running", publishSerial);
            return;
          }
          await store.persistFailure(asCorpusBatch(event.job), errorDetail(event.error));
          state.failed += event.job.items.length;
          await publish(options, store, state, fatalReason ?? "running", publishSerial);
        },
      });
      cancelled = outcome.cancelled || Boolean(options.signal?.aborted);
      if (outcome.unexpected[0] !== undefined) {
        await assembleTranslations(options.outDir, options.plan).catch(() => undefined);
        await publish(options, store, state, fatalReason ?? "incomplete", publishSerial).catch(() => undefined);
        throw outcome.unexpected[0];
      }
    }
    const stoppedReason = resolveStoppedReason(state, cancelled, fatalReason);
    await assembleTranslations(options.outDir, options.plan);
    await publish(options, store, state, stoppedReason, publishSerial);
    if (cancelled) {
      throw new TranslationError("CANCELLED", "Translation request was cancelled");
    }
    return toResult(store, state, stoppedReason, cancelled, (options.io.now ?? Date.now)() - startedAt);
  } finally {
    await releaseJobLock(store.paths.lock);
  }
}

function pendingWork(plan: CorpusPlan, completedIds: ReadonlySet<string>): RecoveryWork[] {
  const jobs: RecoveryWork[] = [];
  for (const batch of plan.batches) {
    const remaining = batch.items.filter((item) => !completedIds.has(item.id));
    if (remaining.length === 0) {
      continue;
    }
    jobs.push(initialRecoveryWork(batch.index, remaining));
  }
  return jobs;
}

async function persistWorkSuccess(
  store: CheckpointStore,
  plan: CorpusPlan,
  work: RecoveryWork,
  translations: readonly { readonly id: string; readonly text: string }[],
): Promise<void> {
  if (isFullOriginalBatch(plan, work)) {
    await store.persistSuccess(asCorpusBatch(work), translations);
    return;
  }
  await store.persistItemSuccesses(work.originIndex, work.items, translations);
}

function isFullOriginalBatch(plan: CorpusPlan, work: RecoveryWork): boolean {
  const original = plan.batches[work.originIndex];
  if (original === undefined || original.items.length !== work.items.length) {
    return false;
  }
  return original.items.every((item, index) => item.id === work.items[index]?.id);
}

function toUnresolvedItem(
  originBatchIndex: number,
  item: CorpusItem,
  attempts: number,
  error: { readonly code: string; readonly message: string },
): StoredUnresolvedItem {
  return {
    id: item.id,
    sourceText: item.text,
    sourceHash: itemSourceHash(item.text),
    originBatchIndex,
    attempts,
    error,
    diagnostics: `unresolved ${item.id} after ${attempts} attempt(s): ${error.message}`,
  };
}

function resolveStoppedReason(
  state: ProgressState,
  cancelled: boolean,
  fatalReason: "auth" | "config" | undefined,
): JobStatus["stoppedReason"] {
  if (cancelled) {
    return "cancelled";
  }
  if (fatalReason !== undefined) {
    return fatalReason;
  }
  if (state.done === state.total && state.failed === 0 && state.unresolved === 0) {
    return "complete";
  }
  return "incomplete";
}

async function publish(
  options: CorpusJobOptions,
  store: CheckpointStore,
  state: ProgressState,
  stoppedReason: JobStatus["stoppedReason"],
  serialize: (work: () => Promise<void>) => Promise<void>,
): Promise<void> {
  await serialize(async () => {
    const elapsedMs = (options.io.now ?? Date.now)() - state.startedAt;
    const pending = Math.max(0, state.total - state.done - state.failed - state.activeItems);
    const status = createJobStatus({
      identityHash: state.identityHash,
      total: state.total,
      done: state.done,
      failed: state.failed,
      active: state.active,
      pending,
      elapsedMs,
      stoppedReason,
    });
    await writeJobStatus(store.paths.status, status);
    const line = formatStatusLine(status);
    if (stoppedReason === "running") {
      options.io.stdout.write(`\r${line}`);
      return;
    }
    options.io.stdout.write(`\r${line}\n`);
  });
}

function toResult(
  store: CheckpointStore,
  state: ProgressState,
  stoppedReason: JobStatus["stoppedReason"],
  cancelled: boolean,
  elapsedMs: number,
): CorpusJobResult {
  return {
    total: state.total,
    done: state.done,
    failed: state.failed,
    pending: Math.max(0, state.total - state.done - state.failed),
    unresolved: state.unresolved,
    cancelled,
    stoppedReason,
    elapsedMs,
    assembledPath: store.paths.assembled,
    statusPath: store.paths.status,
    unresolvedPath: store.paths.unresolved,
  };
}
