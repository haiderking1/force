import type { EnvRecord } from "../translation/config/schema.ts";
import type { FetchLike } from "../translation/http/openai-compatible-client.ts";

export type CliWriter = {
  write(text: string): unknown;
};

export type CliIo = {
  readonly env: EnvRecord;
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly signal?: AbortSignal;
};
