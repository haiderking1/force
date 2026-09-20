import type { ClientDependencies } from "../../http/openai-compatible-client.ts";
import { createOpenAiCompatibleClient } from "../../http/openai-compatible-client.ts";
import type { TranslationConfig } from "../../config/schema.ts";
import { TranslationError } from "../../errors.ts";
import type { TranslationClient } from "../../types.ts";
import {
  applyClineThinkingDisabled,
  CLINE_FREE_COMPLETIONS_PATH,
  CLINE_FREE_HEADERS,
  formatClineBearer,
} from "./contract.ts";

export function createClineFreeTranslationClient(
  config: TranslationConfig,
  deps: ClientDependencies = {},
): TranslationClient {
  if (config.provider !== "cline-free") {
    throw new TranslationError("CONFIG", `Cline Free client received provider ${config.provider}`);
  }

  const headers: Record<string, string> = { ...CLINE_FREE_HEADERS };
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
    },
    deps,
  );
}

export function clineFreeCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${CLINE_FREE_COMPLETIONS_PATH}`;
}
