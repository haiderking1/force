export const TRANSLATION_PROVIDERS = ["cline-free"] as const;

export type TranslationProvider = (typeof TRANSLATION_PROVIDERS)[number];

export const TRANSLATION_ENV = {
  PROVIDER: "FORCE_TRANSLATION_PROVIDER",
  BASE_URL: "FORCE_TRANSLATION_BASE_URL",
  MODEL: "FORCE_TRANSLATION_MODEL",
  API_KEY: "FORCE_TRANSLATION_API_KEY",
  TARGET_LANGUAGE: "FORCE_TRANSLATION_TARGET_LANGUAGE",
  MAX_RETRIES: "FORCE_TRANSLATION_MAX_RETRIES",
  RETRY_BACKOFF_MS: "FORCE_TRANSLATION_RETRY_BACKOFF_MS",
  WORKERS: "FORCE_TRANSLATION_WORKERS",
  BATCH_SIZE: "FORCE_TRANSLATION_BATCH_SIZE",
  TEMPERATURE: "FORCE_TRANSLATION_TEMPERATURE",
} as const;

export type TranslationConfig = {
  readonly provider: TranslationProvider;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly targetLanguage: string;
  readonly maxRetries: number;
  readonly retryBackoffMs: number;
  readonly workers: number;
  readonly batchSize: number;
  readonly temperature: number;
};

export type LoadTranslationConfigOptions = {
  readonly requireApiKey?: boolean;
};

export type EnvRecord = Record<string, string | undefined>;
