import { TranslationError } from "../errors.ts";

export function isRetryableStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 529
  );
}

export function parseRetryAfterMs(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return Math.max(0, parsed - nowMs);
}

export function retryDelayMs(
  retryBackoffMs: number,
  attempt: number,
  retryAfter?: string | null,
  nowMs: number = Date.now(),
): number {
  const fromHeader = parseRetryAfterMs(retryAfter, nowMs);
  if (fromHeader !== undefined) {
    return fromHeader;
  }
  return retryBackoffMs * 2 ** attempt;
}

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
  if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
    throw new TranslationError("CANCELLED", "Translation request was cancelled");
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    throw new TranslationError("CANCELLED", "Translation request was cancelled");
  }
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms === 0) {
    signal?.throwIfAborted();
    return;
  }
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isRetryableNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

export function isCancelledError(error: unknown): boolean {
  if (error instanceof TranslationError) {
    return error.code === "CANCELLED";
  }
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
