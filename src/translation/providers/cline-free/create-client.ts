import type { ClientDependencies } from "../../http/openai-compatible-client.ts";
import type { TranslationConfig } from "../../config/schema.ts";
import { TranslationError } from "../../errors.ts";
import type { TranslationClient } from "../../types.ts";
import { createClineTransport } from "../cline-common/create-client.ts";
import { CLINE_FREE_COMPLETIONS_PATH, CLINE_FREE_HEADERS } from "./contract.ts";

export function createClineFreeTranslationClient(
  config: TranslationConfig,
  deps: ClientDependencies = {},
): TranslationClient {
  if (config.provider !== "cline-free") {
    throw new TranslationError("CONFIG", `Cline Free client received provider ${config.provider}`);
  }
  return createClineTransport(config, CLINE_FREE_HEADERS, deps);
}

export function clineFreeCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${CLINE_FREE_COMPLETIONS_PATH}`;
}
