import type { TranslationConfig } from "../../config/schema.ts";
import { TranslationError } from "../../errors.ts";
import type { ClientDependencies } from "../../http/openai-compatible-client.ts";
import type { TranslationClient } from "../../types.ts";
import { createClineTransport } from "../cline-common/create-client.ts";

export function createClineTranslationClient(
  config: TranslationConfig,
  deps: ClientDependencies = {},
): TranslationClient {
  if (config.provider !== "cline") {
    throw new TranslationError("CONFIG", `Cline client received provider ${config.provider}`);
  }
  // The official API needs only Content-Type and plain Bearer authentication.
  return createClineTransport(config, {}, deps);
}
