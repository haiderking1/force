import { expect, test } from "bun:test";
import { isRecord } from "../unknown.ts";
import { buildTranslationMessages } from "../prompt.ts";
import { buildTranslationUserPayload } from "./user-payload.ts";

test("user payload keeps items as source text and lists per-item token counts as guidance", () => {
  const request = {
    targetLanguage: "ar",
    placeholders: ["{name}", "%s", "/bleep/"],
    items: [
      { id: "once", text: "Hello {name}" },
      { id: "twice", text: "{name} and {name}" },
      { id: "bleep", text: "Oh /bleep/word/bleep/." },
      { id: "plain", text: "Ready" },
    ],
  };
  const payload = buildTranslationUserPayload(request);
  expect(payload.items).toEqual(request.items);
  expect(payload.guidance.role).toBe("preservation-constraints");
  expect(payload.guidance.requiredTokenCounts).toEqual([
    { id: "once", tokens: [{ token: "{name}", count: 1 }] },
    { id: "twice", tokens: [{ token: "{name}", count: 2 }] },
    { id: "bleep", tokens: [{ token: "/bleep/", count: 2 }] },
    { id: "plain", tokens: [] },
  ]);
  const counts = payload.guidance.requiredTokenCounts.map((row) =>
    row.tokens.find((entry) => entry.token === "{name}")?.count,
  );
  expect(counts).toEqual([1, 2, undefined, undefined]);
  expect(counts).not.toContain(3);
});

test("parsed outbound payload preserves literal backslash tokens and distinct ids", () => {
  const request = {
    targetLanguage: "ar",
    placeholders: ["\\n", "\\r", "\\t", '\\"', "{name}"],
    items: [
      { id: "escapes", text: "ROLE\\r\\nRanged.\\tHe said \\\"go\\\"" },
      { id: "same-a", text: "Hello {name}" },
      { id: "same-b", text: "Hello {name}" },
    ],
  };
  const messages = buildTranslationMessages(request);
  const parsed: unknown = JSON.parse(messages[1]?.content ?? "");
  if (!isRecord(parsed) || !Array.isArray(parsed.items) || !isRecord(parsed.guidance)) {
    throw new Error("user payload shape is invalid");
  }
  expect(parsed.guidance.role).toBe("preservation-constraints");
  const items = parsed.items;
  const first = items[0];
  if (!isRecord(first) || typeof first.id !== "string" || typeof first.text !== "string") {
    throw new Error("first item is invalid");
  }
  expect(first.id).toBe("escapes");
  expect(first.text).toBe("ROLE\\r\\nRanged.\\tHe said \\\"go\\\"");
  expect(first.text.includes("\n")).toBe(false);
  expect(first.text.includes("\r")).toBe(false);
  expect(first.text.includes("\t")).toBe(false);
  expect(first.text.includes("\\n")).toBe(true);
  expect(first.text.includes("\\r")).toBe(true);
  expect(first.text.includes("\\t")).toBe(true);
  expect(first.text.includes('\\"')).toBe(true);

  if (!Array.isArray(parsed.guidance.requiredTokenCounts)) {
    throw new Error("requiredTokenCounts is missing");
  }
  const escapeCounts = parsed.guidance.requiredTokenCounts[0];
  if (!isRecord(escapeCounts) || !Array.isArray(escapeCounts.tokens)) {
    throw new Error("escape token counts are invalid");
  }
  expect(escapeCounts.id).toBe("escapes");
  expect(escapeCounts.tokens).toContainEqual({ token: "\\n", count: 1 });
  expect(escapeCounts.tokens).toContainEqual({ token: "\\r", count: 1 });
  expect(escapeCounts.tokens).toContainEqual({ token: "\\t", count: 1 });
  expect(escapeCounts.tokens).toContainEqual({ token: '\\"', count: 2 });

  expect(items.map((entry) => (isRecord(entry) ? entry.id : undefined))).toEqual([
    "escapes",
    "same-a",
    "same-b",
  ]);
  expect(items.map((entry) => (isRecord(entry) ? entry.text : undefined))).toEqual([
    "ROLE\\r\\nRanged.\\tHe said \\\"go\\\"",
    "Hello {name}",
    "Hello {name}",
  ]);
});

test("system prompt does not dump the corpus-wide placeholder list", () => {
  const messages = buildTranslationMessages({
    targetLanguage: "ar",
    placeholders: ["{name}", "{0}", "{1}", "%s", "%d", "/Activate/", "/CASH/", "_PANBUTTON_"],
    items: [{ id: "greet", text: "Hi {name}" }],
  });
  expect(messages[0]?.content).not.toContain(
    "Preserve these placeholders exactly, with the same spelling and count",
  );
  const parsed: unknown = JSON.parse(messages[1]?.content ?? "");
  if (!isRecord(parsed) || !isRecord(parsed.guidance) || !Array.isArray(parsed.guidance.requiredTokenCounts)) {
    throw new Error("user payload guidance is invalid");
  }
  expect(parsed.guidance.requiredTokenCounts).toEqual([
    { id: "greet", tokens: [{ token: "{name}", count: 1 }] },
  ]);
});
