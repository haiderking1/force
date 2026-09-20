import type { TranslationConfig } from "../../config/schema.ts";
import { createOpenAiCompatibleClient, type ClientDependencies } from "../../http/openai-compatible-client.ts";
import type { TranslationClient } from "../../types.ts";
import { applyClineThinkingDisabled, formatClineBearer } from "./contract.ts";
import { unwrapClineCompletion } from "./response.ts";

export function createClineTransport(
  config: TranslationConfig,
  headers: Readonly<Record<string, string>>,
  deps: ClientDependencies,
): TranslationClient {
  const apiKey = config.apiKey.length > 0 ? formatClineBearer(config.apiKey) : "";

  return createOpenAiCompatibleClient(
    {
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey,
      maxRetries: config.maxRetries,
      retryBackoffMs: config.retryBackoffMs,
      temperature: config.temperature,
      workers: config.workers,
      batchSize: config.batchSize,
      headers,
      extraBody: {},
      finalizePayload: applyClineThinkingDisabled,
      unwrapCompletion: unwrapClineCompletion,
    },
    deps,
  );
}
