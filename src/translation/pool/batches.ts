import { assertPoolLimits } from "./settings.ts";

export function splitIntoBatches<T>(items: readonly T[], batchSize: number): T[][] {
  assertPoolLimits(1, batchSize);
  const batches: T[][] = [];
  for (let offset = 0; offset < items.length; offset += batchSize) {
    batches.push(items.slice(offset, offset + batchSize));
  }
  return batches;
}
