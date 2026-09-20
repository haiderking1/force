import { assertValidTranslateRequest } from "../request.ts";
import { translateWithPool } from "../pool/translate.ts";
import type { OutboundRequest, TranslateOptions, TranslateRequest, TranslateResult, TranslationClient } from "../types.ts";
import { buildOutboundRequest } from "./outbound.ts";
import { postCompletion } from "./post-completion.ts";
import { sleep } from "./retry.ts";
import type { ClientDependencies, FetchLike, OpenAiCompatibleSettings } from "./types.ts";

export type { ClientDependencies, FetchLike, OpenAiCompatibleSettings } from "./types.ts";

export function createOpenAiCompatibleClient(
  settings: OpenAiCompatibleSettings,
  deps: ClientDependencies = {},
): TranslationClient {
  const fetcher = deps.fetch ?? ((input, init) => fetch(input, init));
  const wait = deps.sleep ?? sleep;

  return {
    buildOutbound(request: TranslateRequest): OutboundRequest {
      assertValidTranslateRequest(request);
      return buildOutboundRequest(settings, request);
    },

    async translate(request: TranslateRequest, options: TranslateOptions = {}): Promise<TranslateResult> {
      assertValidTranslateRequest(request);
      return translateWithPool({
        request,
        options,
        workers: settings.workers,
        batchSize: settings.batchSize,
        translateBatch: (batchRequest, batchOptions) =>
          postCompletion(settings, batchRequest, batchOptions, { fetch: fetcher, sleep: wait }),
      });
    },
  };
}
