export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type OpenAiCompatibleSettings = {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly maxRetries: number;
  readonly retryBackoffMs: number;
  readonly temperature: number;
  readonly workers: number;
  readonly batchSize: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly extraBody: Readonly<Record<string, unknown>>;
  readonly finalizePayload?: (body: Record<string, unknown>) => Record<string, unknown>;
};

export type ClientDependencies = {
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};
