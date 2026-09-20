import { createClinePassTranslationClient } from "./providers/cline-pass/create-client.ts";
import { createClineTranslationClient } from "./providers/cline/create-client.ts";
import type { TranslationConfig } from "./config/schema.ts";
import { TranslationError } from "./errors.ts";
import type { ClientDependencies } from "./http/openai-compatible-client.ts";
import { createClineFreeTranslationClient } from "./providers/cline-free/create-client.ts";
import type { TranslationClient } from "./types.ts";

export function createTranslationClient(
  config: TranslationConfig,
  deps: ClientDependencies = {},
): TranslationClient {
  switch (config.provider) {
    case "cline-pass":
      return createClinePassTranslationClient(config, deps);
    case "cline":
      return createClineTranslationClient(config, deps);
    case "cline-free":
      return createClineFreeTranslationClient(config, deps);
    default: {
      const unsupported: never = config.provider;
      throw new TranslationError("CONFIG", `Unsupported translation provider: ${String(unsupported)}`);
    }
  }
}
