import { expect, test } from "bun:test";
import { TranslationError } from "./errors.ts";
import {
  DUPLICATE_ID_JSON,
  EXTRA_ID_JSON,
  MISSING_ID_JSON,
  MISSING_PLACEHOLDER_JSON,
  SAMPLE_REQUEST,
  VALID_TRANSLATIONS_JSON,
  completionEnvelope,
} from "./http/fixtures/completions.ts";
import { assertValidTranslateRequest } from "./request.ts";
import { extractJsonValue, readCompletionContent, validateTranslations } from "./response.ts";

test("accepts a valid completion and returns source id order", () => {
  const content = readCompletionContent(completionEnvelope(VALID_TRANSLATIONS_JSON));
  const translations = validateTranslations(extractJsonValue(content), SAMPLE_REQUEST);
  expect(translations).toEqual([
    { id: "greet", text: "مرحبا، {name}!" },
    { id: "score", text: "النتيجة: %s" },
  ]);
});

test("accepts a JSON fenced completion", () => {
  const content = readCompletionContent(completionEnvelope(`\`\`\`json\n${VALID_TRANSLATIONS_JSON}\n\`\`\``));
  expect(validateTranslations(extractJsonValue(content), SAMPLE_REQUEST)).toHaveLength(2);
});

test("rejects malformed, missing, extra, and duplicate ids", () => {
  expect(() => extractJsonValue("not-json")).toThrow(/not valid JSON/);
  expect(() => validateTranslations(extractJsonValue(MISSING_ID_JSON), SAMPLE_REQUEST)).toThrow(
    /missing ids: score/,
  );
  expect(() => validateTranslations(extractJsonValue(EXTRA_ID_JSON), SAMPLE_REQUEST)).toThrow(
    /unexpected ids: bonus/,
  );
  expect(() => validateTranslations(extractJsonValue(DUPLICATE_ID_JSON), SAMPLE_REQUEST)).toThrow(
    /duplicate id: greet/,
  );
});

test("rejects missing placeholders and invalid completion envelopes", () => {
  expect(() => validateTranslations(extractJsonValue(MISSING_PLACEHOLDER_JSON), SAMPLE_REQUEST)).toThrow(
    /missing placeholders: \{name\}/,
  );
  expect(() => readCompletionContent({})).toThrow(/missing choices/);
  expect(() => readCompletionContent(completionEnvelope("   "))).toThrow(/content is missing/);
  expect(() => validateTranslations({ translations: [{ id: "greet", text: 1 }] }, SAMPLE_REQUEST)).toThrow(
    /string id and text/,
  );
});

test("rejects empty items and duplicate source ids before a request", () => {
  expect(() =>
    assertValidTranslateRequest({ targetLanguage: "ar", items: [], placeholders: [] }),
  ).toThrow(TranslationError);
  expect(() =>
    assertValidTranslateRequest({
      targetLanguage: "ar",
      placeholders: [],
      items: [
        { id: "a", text: "one" },
        { id: "a", text: "two" },
      ],
    }),
  ).toThrow(/Duplicate text id: a/);
});
