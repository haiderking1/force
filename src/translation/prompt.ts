import type { TranslateRequest } from "./types.ts";
import { ARABIC_TRANSLATION_PROMPT } from "./prompts/arabic.ts";
import { TRANSLATION_OUTPUT_CONTRACT } from "./prompts/output-contract.ts";
import { buildTranslationUserPayload } from "./prompts/user-payload.ts";

export type ChatMessage = {
  readonly role: "system" | "user";
  readonly content: string;
};

export function buildTranslationMessages(request: TranslateRequest): ChatMessage[] {
  const targetLine = `Target language: ${request.targetLanguage}`;
  const genericSystem = [
    "You translate text into a specified target language.",
    targetLine,
    TRANSLATION_OUTPUT_CONTRACT,
  ].join("\n");
  const isArabic = /^(ar(?:[-_].*)?|arabic|العربية)$/i.test(request.targetLanguage.trim());
  const system = isArabic
    ? `${ARABIC_TRANSLATION_PROMPT}\n${targetLine}\n${TRANSLATION_OUTPUT_CONTRACT}`
    : genericSystem;

  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(buildTranslationUserPayload(request)) },
  ];
}
