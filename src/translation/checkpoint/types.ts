import type { CheckpointIdentity, CorpusItem, CorpusSourceMapping } from "../corpus/types.ts";

export const CHECKPOINT_SCHEMA_VERSION = 1 as const;

export type StoredBatchSuccess = {
  readonly schemaVersion: 1;
  readonly batchIndex: number;
  readonly identityHash: string;
  readonly items: readonly { readonly id: string; readonly sourceText: string }[];
  readonly translations: readonly { readonly id: string; readonly text: string }[];
};

export type StoredBatchFailure = {
  readonly schemaVersion: 1;
  readonly batchIndex: number;
  readonly identityHash: string;
  readonly itemIds: readonly string[];
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
};

export type StoredItemSuccess = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sourceText: string;
  readonly sourceHash: string;
  readonly identityHash: string;
  readonly text: string;
  readonly originBatchIndex: number;
};

export type StoredUnresolvedItem = {
  readonly id: string;
  readonly sourceText: string;
  readonly sourceHash: string;
  readonly originBatchIndex: number;
  readonly attempts: number;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
  readonly diagnostics: string;
};

export type StoredUnresolved = {
  readonly schemaVersion: 1;
  readonly identityHash: string;
  readonly items: readonly StoredUnresolvedItem[];
};

export type StoredSources = {
  readonly schemaVersion: 1;
  readonly identity: CheckpointIdentity;
  readonly items: readonly CorpusItem[];
};

export type JobLock = {
  readonly pid: number;
  readonly startedAt: string;
  readonly hostname: string;
  readonly identityHash: string;
};

export type JobStatus = {
  readonly schemaVersion: 1;
  readonly identityHash: string;
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly active: number;
  readonly pending: number;
  readonly elapsedMs: number;
  readonly stoppedReason: "running" | "complete" | "incomplete" | "cancelled" | "auth" | "config";
};

export type AssembledTranslation = {
  readonly id: string;
  readonly text: string;
  readonly sourceText: string;
  readonly source: CorpusSourceMapping;
};

export type AssembledOutput = {
  readonly schemaVersion: 1;
  readonly identity: CheckpointIdentity;
  readonly translations: readonly AssembledTranslation[];
};
