import { DiscoveryError, DiscoveryHttpError, discoveryErrorMessage } from "../errors.ts";
import {
  JEV_EVALUATE_PATH,
  type FetchLike,
  type JevRequestBody,
  type JevResponseBody,
} from "./contract.ts";
import type { JevConfig } from "./config.ts";
import { ROLE_QUESTION_KEYS, discoveryQuestions } from "./questions.ts";
import {
  classifyThrownAbort,
  isRetryableNetworkError,
  isRetryableStatus,
  retryDelayMs,
  sleep,
  throwIfAborted,
} from "./retry.ts";
import { rolesFromAnswers, validateJevResponse } from "./validate.ts";
import type { RoleProbabilities } from "../report/types.ts";

export type JevClientDependencies = {
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export type JevEvaluateResult = {
  readonly roles: RoleProbabilities;
  readonly resolvedModel: string;
};

export type JevClient = {
  evaluate(state: unknown, signal?: AbortSignal): Promise<JevEvaluateResult>;
};

export function createJevClient(config: JevConfig, deps: JevClientDependencies = {}): JevClient {
  const fetcher = deps.fetch ?? ((input, init) => fetch(input, init));
  const wait = deps.sleep ?? sleep;
  return {
    evaluate(state: unknown, signal?: AbortSignal) {
      return postSystemOne(config, state, { fetch: fetcher, sleep: wait }, signal);
    },
  };
}

export function buildOutbound(config: JevConfig, state: unknown): { url: string; headers: Record<string, string>; body: JevRequestBody } {
  const url = `${config.baseUrl}${JEV_EVALUATE_PATH}`;
  return {
    url,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: {
      model: config.model,
      state,
      questions: discoveryQuestions(),
    },
  };
}

async function postSystemOne(
  config: JevConfig,
  state: unknown,
  deps: { fetch: FetchLike; sleep: (ms: number, signal?: AbortSignal) => Promise<void> },
  signal?: AbortSignal,
): Promise<JevEvaluateResult> {
  const outbound = buildOutbound(config, state);
  const body = JSON.stringify(outbound.body);
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    throwIfAborted(signal);
    let retryAfter: string | null = null;
    try {
      const init: RequestInit = {
        method: "POST",
        headers: outbound.headers,
        body,
        redirect: "error",
      };
      if (signal !== undefined) {
        init.signal = signal;
      }
      const response = await deps.fetch(outbound.url, init);
      if (response.ok) {
        const payload: unknown = await readJson(response);
        const parsed: JevResponseBody = validateJevResponse(payload, ROLE_QUESTION_KEYS);
        return {
          roles: rolesFromAnswers(parsed.answers),
          resolvedModel: parsed.model,
        };
      }
      const retryable = isRetryableStatus(response.status);
      lastError = new DiscoveryHttpError(response.status, retryable);
      retryAfter = response.headers.get("Retry-After");
      if (!retryable || attempt === config.maxRetries) {
        throw lastError;
      }
    } catch (error) {
      throwIfAborted(signal);
      classifyThrownAbort(error);
      if (error instanceof DiscoveryError && !(error instanceof DiscoveryHttpError)) {
        throw error;
      }
      if (error instanceof DiscoveryHttpError) {
        lastError = error;
        if (!error.retryable || attempt === config.maxRetries) {
          throw error;
        }
      } else if (isRetryableNetworkError(error) && attempt < config.maxRetries) {
        lastError = error;
      } else {
        throw new DiscoveryError("HTTP", `Jev request failed: ${discoveryErrorMessage(error)}`);
      }
    }

    const delay = retryDelayMs(config.retryBackoffMs, attempt, retryAfter);
    try {
      await deps.sleep(delay, signal);
    } catch (error) {
      classifyThrownAbort(error);
      throwIfAborted(signal);
      throw new DiscoveryError("CANCELLED", "Jev request was cancelled");
    }
  }

  throw lastError instanceof DiscoveryError
    ? lastError
    : new DiscoveryError("HTTP", "Jev request failed");
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new DiscoveryError("RESPONSE", `Jev response is not valid JSON: ${discoveryErrorMessage(error)}`);
  }
}
