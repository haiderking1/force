import { requiredTokenCountsForText, type RequiredTokenCount } from "../tokens/required.ts";
import type { SourceText, TranslateRequest } from "../types.ts";

export type UserPayloadItem = {
  readonly id: string;
  readonly text: string;
  readonly context?: string;
};

export type UserPayloadTokenCounts = {
  readonly id: string;
  readonly tokens: readonly RequiredTokenCount[];
};

export type TranslationUserGuidance = {
  readonly role: "preservation-constraints";
  readonly requiredTokenCounts: readonly UserPayloadTokenCounts[];
};

export type TranslationUserPayload = {
  readonly items: readonly UserPayloadItem[];
  readonly guidance: TranslationUserGuidance;
};

export function buildTranslationUserPayload(request: TranslateRequest): TranslationUserPayload {
  const items: SourceText[] = request.items.map((item) => ({ id: item.id, text: item.text, ...(item.context === undefined ? {} : { context: item.context }) }));
  return {
    items,
    guidance: {
      role: "preservation-constraints",
      requiredTokenCounts: items.map((item) => ({
        id: item.id,
        tokens: requiredTokenCountsForText(item.text, request.placeholders),
      })),
    },
  };
}
