import type { TranslationConfig } from "../../config/schema.ts";
import { TranslationError } from "../../errors.ts";
import type { ClientDependencies } from "../../http/openai-compatible-client.ts";
import type { TranslationClient } from "../../types.ts";
import { createClineTransport } from "../cline-common/create-client.ts";
import { CLINE_PASS_PROVIDER, isClinePassModel } from "./contract.ts";

export function createClinePassTranslationClient(
  config: TranslationConfig,
  deps: ClientDependencies = {},
): TranslationClient {
  if (config.provider !== CLINE_PASS_PROVIDER) {
    throw new TranslationError("CONFIG", `Cline Pass client received provider ${config.provider}`);
  }
  if (!isClinePassModel(config.model)) {
    throw new TranslationError("CONFIG", "Cline Pass requires a cline-pass/ model id");
  }
  return createClineTransport(config, {}, deps);
}
