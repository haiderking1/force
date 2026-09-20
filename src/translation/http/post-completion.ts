import { redactText, secretsFromApiKey } from "../diagnostics.ts";
import { TranslationError, TranslationHttpError } from "../errors.ts";
import { extractJsonValue, readCompletionContent, validateTranslations } from "../response.ts";
import type { TranslateOptions, TranslateRequest, TranslateResult } from "../types.ts";
import { errorMessage } from "../unknown.ts";
import { buildOutboundRequest } from "./outbound.ts";
import {
  classifyThrownAbort,
  isRetryableNetworkError,
  isRetryableStatus,
  retryDelayMs,
  throwIfAborted,
} from "./retry.ts";
import type { FetchLike, OpenAiCompatibleSettings } from "./types.ts";

export type PostCompletionDependencies = {
  readonly fetch: FetchLike;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export async function postCompletion(
  settings: OpenAiCompatibleSettings,
  request: TranslateRequest,
  options: TranslateOptions,
  deps: PostCompletionDependencies,
): Promise<TranslateResult> {
  const outbound = buildOutboundRequest(settings, request);
  const body = JSON.stringify(outbound.body);
  const secrets = secretsFromApiKey(settings.apiKey);
  let lastError: unknown;

  for (let attempt = 0; attempt <= settings.maxRetries; attempt += 1) {
    throwIfAborted(options.signal);
    let retryAfter: string | null = null;

    try {
      const response = await deps.fetch(outbound.url, {
        method: "POST",
        headers: outbound.headers,
        body,
        signal: options.signal,
        redirect: "error",
      });
      if (response.ok) {
        const payload: unknown = await readJson(response, secrets);
        const content = readCompletionContent(payload);
        const translations = validateTranslations(extractJsonValue(content), request);
        return { translations };
      }
      const retryable = isRetryableStatus(response.status);
      lastError = new TranslationHttpError(response.status, retryable);
      retryAfter = response.headers.get("Retry-After");
      if (!retryable || attempt === settings.maxRetries) {
        throw lastError;
      }
    } catch (error) {
      throwIfAborted(options.signal);
      classifyThrownAbort(error);
      if (error instanceof TranslationError && !(error instanceof TranslationHttpError)) {
        throw redactError(error, secrets);
      }
      if (error instanceof TranslationHttpError) {
        lastError = error;
        if (!error.retryable || attempt === settings.maxRetries) {
          throw error;
        }
      } else if (isRetryableNetworkError(error) && attempt < settings.maxRetries) {
        lastError = error;
      } else {
        throw redactError(
          new TranslationError("HTTP", `Translation request failed: ${redactText(errorMessage(error), secrets)}`),
          secrets,
        );
      }
    }

    const delay = retryDelayMs(settings.retryBackoffMs, attempt, retryAfter);
    try {
      await deps.sleep(delay, options.signal);
    } catch (error) {
      classifyThrownAbort(error);
      throwIfAborted(options.signal);
      throw redactError(
        new TranslationError("CANCELLED", "Translation request was cancelled"),
        secrets,
      );
    }
  }

  throw lastError instanceof TranslationError
    ? lastError
    : new TranslationError("HTTP", "Translation request failed");
}

async function readJson(response: Response, secrets: readonly string[]): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw redactError(
      new TranslationError("RESPONSE", `Translation completion is not valid JSON: ${redactText(errorMessage(error), secrets)}`),
      secrets,
    );
  }
}

function redactError(error: TranslationError, secrets: readonly string[]): TranslationError {
  error.message = redactText(error.message, secrets);
  return error;
}
