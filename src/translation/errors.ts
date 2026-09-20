export class TranslationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TranslationError";
    this.code = code;
  }
}

export class TranslationHttpError extends TranslationError {
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, retryable: boolean) {
    super("HTTP", `Translation request failed (HTTP ${status})`);
    this.name = "TranslationHttpError";
    this.status = status;
    this.retryable = retryable;
  }
}

export class TranslationPoolError extends TranslationError {
  readonly failedIds: readonly string[];
  readonly failures: readonly TranslationError[];

  constructor(failedIds: readonly string[], failures: readonly TranslationError[]) {
    const preview = failedIds.join(", ");
    const first = failures[0];
    const detail = first === undefined ? "Translation batch failed" : first.message;
    super("POOL", `Translation failed for ${failedIds.length} item(s) (${preview}): ${detail}`);
    this.name = "TranslationPoolError";
    this.failedIds = failedIds;
    this.failures = failures;
  }
}

export function isTranslationError(error: unknown): error is TranslationError {
  return error instanceof TranslationError;
}
