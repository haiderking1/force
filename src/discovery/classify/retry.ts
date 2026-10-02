import { isAbortError } from "../../shared/http/retry.ts";
import { DiscoveryError } from "../errors.ts";

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
  throw new DiscoveryError("CANCELLED", "Jev request was cancelled");
}

export function classifyThrownAbort(error: unknown): void {
  if (error instanceof DiscoveryError) {
    throw error;
  }
  if (isAbortError(error)) {
    throw new DiscoveryError("CANCELLED", "Jev request was cancelled");
  }
}
