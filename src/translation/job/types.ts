import type { JobStatus } from "../checkpoint/types.ts";
import type { CorpusPlan } from "../corpus/types.ts";
import type { TranslationClient } from "../types.ts";

export type CorpusJobIo = {
  readonly stdout: { write(text: string): unknown };
  readonly now?: () => number;
};

export type CorpusJobOptions = {
  readonly plan: CorpusPlan;
  readonly outDir: string;
  readonly resume: boolean;
  readonly client: TranslationClient;
  readonly signal?: AbortSignal;
  readonly io: CorpusJobIo;
};

export type CorpusJobResult = {
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly pending: number;
  readonly unresolved: number;
  readonly cancelled: boolean;
  readonly stoppedReason: JobStatus["stoppedReason"];
  readonly elapsedMs: number;
  readonly assembledPath: string;
  readonly statusPath: string;
  readonly unresolvedPath: string;
};
