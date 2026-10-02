import { isAbortError } from "../../shared/http/retry.ts";
import { TranslationError } from "../errors.ts";

export {
  isRetryableStatus,
  parseRetryAfterMs,
  retryDelayMs,
  sleep,
  isRetryableNetworkError,
} from "../../shared/http/retry.ts";

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  throw new TranslationError("CANCELLED", "Translation request was cancelled");
}

export function classifyThrownAbort(error: unknown): never | void {
  if (error instanceof TranslationError) {
    throw error;
  }
  if (isAbortError(error)) {
    throw new TranslationError("CANCELLED", "Translation request was cancelled");
  }
}

export function isCancelledError(error: unknown): boolean {
  if (error instanceof TranslationError) {
    return error.code === "CANCELLED";
  }
  return isAbortError(error);
}
