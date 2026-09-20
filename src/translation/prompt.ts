import type { TranslateRequest } from "./types.ts";

export type ChatMessage = {
  readonly role: "system" | "user";
  readonly content: string;
};

export function buildTranslationMessages(request: TranslateRequest): ChatMessage[] {
  const placeholderLine =
    request.placeholders.length === 0
      ? "No placeholders are specified."
      : `Preserve these placeholders exactly, with the same spelling and count: ${request.placeholders.join(", ")}`;

  const system = [
    "You translate text into a specified target language.",
    `Target language: ${request.targetLanguage}`,
    placeholderLine,
    "Keep every source id unchanged.",
    'Return only JSON with this shape: {"translations":[{"id":"string","text":"string"}]}',
    "Do not include explanations or markdown.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ items: request.items }) },
  ];
}
