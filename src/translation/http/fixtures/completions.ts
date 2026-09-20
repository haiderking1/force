import type { SourceText, TranslateRequest } from "../../types.ts";
import { isRecord } from "../../unknown.ts";

export const SAMPLE_REQUEST: TranslateRequest = {
  targetLanguage: "ar",
  placeholders: ["{name}", "%s"],
  items: [
    { id: "greet", text: "Hello, {name}!" },
    { id: "score", text: "Score: %s" },
  ],
};

export function completionEnvelope(content: string): Record<string, unknown> {
  return {
    id: "cmpl-test",
    choices: [{ index: 0, message: { role: "assistant", content } }],
  };
}

export const VALID_TRANSLATIONS_JSON = JSON.stringify({
  translations: [
    { id: "score", text: "النتيجة: %s" },
    { id: "greet", text: "مرحبا، {name}!" },
  ],
});

export const MISSING_ID_JSON = JSON.stringify({
  translations: [{ id: "greet", text: "مرحبا، {name}!" }],
});

export const EXTRA_ID_JSON = JSON.stringify({
  translations: [
    { id: "greet", text: "مرحبا، {name}!" },
    { id: "score", text: "النتيجة: %s" },
    { id: "bonus", text: "إضافي" },
  ],
});

export const DUPLICATE_ID_JSON = JSON.stringify({
  translations: [
    { id: "greet", text: "مرحبا، {name}!" },
    { id: "greet", text: "أهلا، {name}!" },
    { id: "score", text: "النتيجة: %s" },
  ],
});

export const MISSING_PLACEHOLDER_JSON = JSON.stringify({
  translations: [
    { id: "greet", text: "مرحبا!" },
    { id: "score", text: "النتيجة: %s" },
  ],
});

export function numberedItems(count: number): SourceText[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `id-${index}`,
    text: `text ${index}`,
  }));
}

export function numberedRequest(count: number): TranslateRequest {
  return {
    targetLanguage: "ar",
    placeholders: [],
    items: numberedItems(count),
  };
}

export function completionForItems(items: readonly SourceText[]): Record<string, unknown> {
  return completionEnvelope(
    JSON.stringify({
      translations: items.map((item) => ({ id: item.id, text: `ar:${item.id}` })),
    }),
  );
}

export function itemsFromOutboundBody(body: unknown): SourceText[] {
  const parsed: unknown = typeof body === "string" ? JSON.parse(body) : body;
  if (!isRecord(parsed) || !Array.isArray(parsed.messages) || parsed.messages.length < 2) {
    throw new Error("outbound body is missing the user message");
  }
  const user = parsed.messages[1];
  if (!isRecord(user) || typeof user.content !== "string") {
    throw new Error("outbound user message is invalid");
  }
  const payload: unknown = JSON.parse(user.content);
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("outbound user message is missing items");
  }
  const items: SourceText[] = [];
  for (const entry of payload.items) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.text !== "string") {
      throw new Error("outbound item is invalid");
    }
    items.push({ id: entry.id, text: entry.text });
  }
  return items;
}
