import { expect, test } from "bun:test";
import { sha256Text } from "../corpus/hash.ts";
import { buildCheckpointIdentity } from "../corpus/plan.ts";
import type { CorpusItem } from "../corpus/types.ts";
import { buildTranslationMessages } from "../prompt.ts";
import { OUTPUT_CONTRACT_EXAMPLES, TRANSLATION_OUTPUT_CONTRACT } from "./output-contract.ts";

test("output contract demands a single JSON object with one record per current id", () => {
  for (const instruction of [
    "Reply with one syntactically valid JSON object and nothing else",
    "No markdown fences, no commentary",
    "Copy each current input id byte-for-byte",
    "Emit exactly one record for every id in this request's items array",
    "Do not omit an id because its English matches another item",
    "Do not invent ids",
    "Do not reuse ids from a previous batch",
    "guidance is not source text",
    "exact required token multiset",
    "A token listed with count 2 must appear twice",
    "Do not borrow tokens from other items",
    "Preserve paired-tag structure and order",
    "/bleep/ is a literal game control marker",
    "not a word to translate",
    "not a cue to insert profanity",
    "Keep every /bleep/ exactly, including repeats",
    "An actual newline character uses the JSON escape shown here",
    "A literal backslash followed by the letter n is two source characters",
    "Ordinary quotation marks inside text must be escaped in JSON",
    "A literal backslash followed by a quotation mark is two source characters",
    "These examples are labeled illustrations",
    "Do not invent speaker facts",
  ]) {
    expect(TRANSLATION_OUTPUT_CONTRACT).toContain(instruction);
  }
  expect(TRANSLATION_OUTPUT_CONTRACT).toContain(OUTPUT_CONTRACT_EXAMPLES.shape);
  expect(TRANSLATION_OUTPUT_CONTRACT).toContain(OUTPUT_CONTRACT_EXAMPLES.actualNewline);
  expect(TRANSLATION_OUTPUT_CONTRACT).toContain(OUTPUT_CONTRACT_EXAMPLES.literalSlashN);
  expect(TRANSLATION_OUTPUT_CONTRACT).toContain(OUTPUT_CONTRACT_EXAMPLES.quotes);
  expect(TRANSLATION_OUTPUT_CONTRACT).toContain(OUTPUT_CONTRACT_EXAMPLES.literalBackslashQuote);
  expect(TRANSLATION_OUTPUT_CONTRACT).toContain(OUTPUT_CONTRACT_EXAMPLES.bleep);
});

test("illustrative JSON examples distinguish actual controls from literal backslash sequences", () => {
  expect(OUTPUT_CONTRACT_EXAMPLES.shape).toBe(
    JSON.stringify({ translations: [{ id: "example-id", text: "translated text" }] }),
  );
  expect(OUTPUT_CONTRACT_EXAMPLES.actualNewline).toBe(
    JSON.stringify({ translations: [{ id: "example-actual-newline", text: "first\nsecond" }] }),
  );
  expect(OUTPUT_CONTRACT_EXAMPLES.literalSlashN).toBe(
    JSON.stringify({ translations: [{ id: "example-literal-slash-n", text: "first\\nsecond" }] }),
  );
  expect(OUTPUT_CONTRACT_EXAMPLES.quotes).toBe(
    JSON.stringify({ translations: [{ id: "example-quotes", text: 'He said "ready"' }] }),
  );
  expect(OUTPUT_CONTRACT_EXAMPLES.literalBackslashQuote).toBe(
    JSON.stringify({
      translations: [{ id: "example-literal-backslash-quote", text: 'He said \\"ready\\"' }],
    }),
  );
  expect(OUTPUT_CONTRACT_EXAMPLES.bleep).toBe(
    JSON.stringify({ translations: [{ id: "example-bleep", text: "Oh /bleep/word/bleep/." }] }),
  );

  const actual = JSON.parse(OUTPUT_CONTRACT_EXAMPLES.actualNewline) as {
    translations: { text: string }[];
  };
  expect(actual.translations[0]?.text).toBe("first\nsecond");
  expect(actual.translations[0]?.text.includes("\n")).toBe(true);
  expect(actual.translations[0]?.text.includes("\\n")).toBe(false);

  const literal = JSON.parse(OUTPUT_CONTRACT_EXAMPLES.literalSlashN) as {
    translations: { text: string }[];
  };
  expect(literal.translations[0]?.text).toBe("first\\nsecond");
  expect(literal.translations[0]?.text.includes("\n")).toBe(false);
  expect(literal.translations[0]?.text.includes("\\n")).toBe(true);

  const quotes = JSON.parse(OUTPUT_CONTRACT_EXAMPLES.quotes) as { translations: { text: string }[] };
  expect(quotes.translations[0]?.text).toBe('He said "ready"');

  const literalQuote = JSON.parse(OUTPUT_CONTRACT_EXAMPLES.literalBackslashQuote) as {
    translations: { text: string }[];
  };
  expect(literalQuote.translations[0]?.text).toBe('He said \\"ready\\"');
  expect(literalQuote.translations[0]?.text.includes('\\"')).toBe(true);
});

test("checkpoint promptHash follows the system message so a prompt change refuses old identity", () => {
  const messages = buildTranslationMessages({
    targetLanguage: "ar",
    placeholders: [],
    items: [{ id: "identity", text: "" }],
  });
  const system = messages[0]?.content;
  if (system === undefined) {
    throw new Error("missing system message");
  }
  expect(system).toContain(TRANSLATION_OUTPUT_CONTRACT);
  const identity = buildCheckpointIdentity({
    items: [corpusItem("a", "Hi")],
    targetLanguage: "ar",
    placeholders: [],
    provider: "cline-free",
    model: "cline-free/deepseek-v4.1-flash",
    baseUrl: "https://api.cline.bot/api/v1",
    temperature: 0,
    batchSize: 50,
  });
  expect(identity.promptHash).toBe(sha256Text(system));
});

function corpusItem(id: string, text: string): CorpusItem {
  return {
    id,
    text,
    source: {
      archiveHeader: "/game/a.~h",
      archivePayload: "/game/a.~p",
      entryName: "stringtable/x",
      entryType: "StringTable",
      entryIndex: 0,
      payloadOffset: 0,
      storedSize: 1,
      contentSize: 1,
      recordId: id,
      sourceByteOffset: 0,
      extra: {},
    },
  };
}
