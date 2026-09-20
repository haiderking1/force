import { buildTranslationMessages } from "../prompt.ts";
import type { OutboundRequest, TranslateRequest } from "../types.ts";
import type { OpenAiCompatibleSettings } from "./types.ts";

export function buildOutboundRequest(
  settings: OpenAiCompatibleSettings,
  request: TranslateRequest,
): OutboundRequest {
  const headers: Record<string, string> = {
    ...settings.headers,
    "Content-Type": "application/json",
  };
  if (settings.apiKey.length > 0) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  const body: Record<string, unknown> = {
    ...settings.extraBody,
    model: settings.model,
    messages: buildTranslationMessages(request),
    temperature: settings.temperature,
    response_format: { type: "json_object" },
  };
  const finalized = settings.finalizePayload ? settings.finalizePayload({ ...body }) : body;

  return {
    url: `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    method: "POST",
    headers,
    body: finalized,
  };
}
