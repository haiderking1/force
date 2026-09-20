import type { CorpusBatch, CorpusItem } from "../corpus/types.ts";

export type RecoveryWork = {
  readonly originIndex: number;
  readonly items: readonly CorpusItem[];
  readonly sameInputRetries: number;
  readonly singletonRepairs: number;
};

export function initialRecoveryWork(originIndex: number, items: readonly CorpusItem[]): RecoveryWork {
  return {
    originIndex,
    items,
    sameInputRetries: 0,
    singletonRepairs: 0,
  };
}

export function asCorpusBatch(work: RecoveryWork): CorpusBatch {
  return {
    index: work.originIndex,
    items: work.items,
  };
}
