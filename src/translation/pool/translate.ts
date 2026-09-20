import { TranslationError, TranslationPoolError } from "../errors.ts";
import type { SourceText, TranslateOptions, TranslateRequest, TranslateResult, TranslationItem } from "../types.ts";
import { splitIntoBatches } from "./batches.ts";
import { runWorkerPool } from "./run.ts";
import { assertPoolLimits } from "./settings.ts";

export type BatchTranslator = (
  request: TranslateRequest,
  options: TranslateOptions,
) => Promise<TranslateResult>;

export type PooledTranslateOptions = {
  readonly request: TranslateRequest;
  readonly options: TranslateOptions;
  readonly workers: number;
  readonly batchSize: number;
  readonly translateBatch: BatchTranslator;
};

export async function translateWithPool(options: PooledTranslateOptions): Promise<TranslateResult> {
  assertPoolLimits(options.workers, options.batchSize);
  const batches = splitIntoBatches(options.request.items, options.batchSize);
  const outcome = await runWorkerPool({
    workers: options.workers,
    jobs: batches,
    signal: options.options.signal,
    run: (items, signal) =>
      options.translateBatch(
        {
          targetLanguage: options.request.targetLanguage,
          placeholders: options.request.placeholders,
          items,
        },
        { signal },
      ),
  });

  if (outcome.cancelled || options.options.signal?.aborted) {
    throw new TranslationError("CANCELLED", "Translation request was cancelled");
  }

  const unexpected = outcome.unexpected[0];
  if (unexpected !== undefined) {
    throw unexpected;
  }

  const translationFailures: TranslationError[] = [];
  const failedIds: string[] = [];
  for (const failure of [...outcome.failures].sort((left, right) => left.index - right.index)) {
    if (failure.error instanceof TranslationError) {
      translationFailures.push(failure.error);
      failedIds.push(...failure.job.map((item) => item.id));
      continue;
    }
    throw failure.error;
  }

  if (translationFailures.length > 0) {
    const only = translationFailures[0];
    if (only !== undefined && batches.length === 1 && translationFailures.length === 1) {
      throw only;
    }
    throw new TranslationPoolError(failedIds, translationFailures);
  }

  const translations: TranslationItem[] = [];
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const result = outcome.results[index];
    if (batch === undefined || result === undefined) {
      const ids = batch === undefined ? [] : batch.map((item: SourceText) => item.id);
      throw new TranslationError(
        "POOL",
        `Translation pool lost results for ${ids.length > 0 ? ids.join(", ") : `batch ${index}`}`,
      );
    }
    translations.push(...result.translations);
  }

  const expectedIds = options.request.items.map((item) => item.id);
  const actualIds = translations.map((item) => item.id);
  if (expectedIds.length !== actualIds.length || expectedIds.some((id, index) => actualIds[index] !== id)) {
    throw new TranslationError("POOL", "Translation pool returned ids out of source order");
  }

  return { translations };
}
