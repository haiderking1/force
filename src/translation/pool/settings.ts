import { TranslationError } from "../errors.ts";

export const DEFAULT_WORKERS = 100;
export const DEFAULT_BATCH_SIZE = 50;
export const MIN_WORKERS = 1;
export const MAX_WORKERS = 1000;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 200;

export function assertPoolLimits(workers: number, batchSize: number): void {
  if (!Number.isSafeInteger(workers) || workers < MIN_WORKERS || workers > MAX_WORKERS) {
    throw new TranslationError(
      "CONFIG",
      `Worker count must be between ${MIN_WORKERS} and ${MAX_WORKERS}`,
    );
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < MIN_BATCH_SIZE || batchSize > MAX_BATCH_SIZE) {
    throw new TranslationError(
      "CONFIG",
      `Batch size must be between ${MIN_BATCH_SIZE} and ${MAX_BATCH_SIZE}`,
    );
  }
}
