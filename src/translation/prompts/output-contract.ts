const EXAMPLE_OUTPUT = JSON.stringify({
  translations: [{ id: "example-id", text: "translated text" }],
});

const EXAMPLE_ACTUAL_NEWLINE = JSON.stringify({
  translations: [{ id: "example-actual-newline", text: "first\nsecond" }],
});

const EXAMPLE_LITERAL_SLASH_N = JSON.stringify({
  translations: [{ id: "example-literal-slash-n", text: "first\\nsecond" }],
});

const EXAMPLE_QUOTES = JSON.stringify({
  translations: [{ id: "example-quotes", text: 'He said "ready"' }],
});

const EXAMPLE_LITERAL_BACKSLASH_QUOTE = JSON.stringify({
  translations: [{ id: "example-literal-backslash-quote", text: 'He said \\"ready\\"' }],
});

const EXAMPLE_BLEEP = JSON.stringify({
  translations: [{ id: "example-bleep", text: "Oh /bleep/word/bleep/." }],
});

export const OUTPUT_CONTRACT_EXAMPLES = {
  shape: EXAMPLE_OUTPUT,
  actualNewline: EXAMPLE_ACTUAL_NEWLINE,
  literalSlashN: EXAMPLE_LITERAL_SLASH_N,
  quotes: EXAMPLE_QUOTES,
  literalBackslashQuote: EXAMPLE_LITERAL_BACKSLASH_QUOTE,
  bleep: EXAMPLE_BLEEP,
} as const;

export const TRANSLATION_OUTPUT_CONTRACT = [
  "Output contract",
  "Reply with one syntactically valid JSON object and nothing else. No markdown fences, no commentary, no notes, no speaker labels, and no scene metadata.",
  `The object must have this shape: ${EXAMPLE_OUTPUT}`,
  "translations is an array. Each element has only id and text. Both values are JSON strings. Do not add other fields.",
  "Copy each current input id byte-for-byte. Emit exactly one record for every id in this request's items array. Do not omit an id because its English matches another item. Do not invent ids. Do not reuse ids from a previous batch.",
  "The user JSON has items and guidance. items[].text is the source to translate. guidance is not source text. Do not translate guidance or copy it into the output. guidance.requiredTokenCounts lists the exact required token multiset for each current item id.",
  "Each translated text must keep that item's required tokens with the same spelling and the same count. A token listed with count 2 must appear twice. Do not borrow tokens from other items to satisfy a batch total.",
  "Preserve paired-tag structure and order when the source uses paired tags such as <color></color>, <b></b>, {i}{/i}, or {font=path}{/font}. Keep timing-tag order. Keep leading and trailing whitespace. Translate only the visible words between tags.",
  "/bleep/ is a literal game control marker. It is not English swearing, not a word to translate, and not a cue to insert profanity. Keep every /bleep/ exactly, including repeats.",
  "Encode each text value as a JSON string with valid escapes.",
  `An actual newline character uses the JSON escape shown here: ${EXAMPLE_ACTUAL_NEWLINE}`,
  `A literal backslash followed by the letter n is two source characters. Keep both. The JSON encoding is: ${EXAMPLE_LITERAL_SLASH_N}`,
  `Ordinary quotation marks inside text must be escaped in JSON: ${EXAMPLE_QUOTES}`,
  `A literal backslash followed by a quotation mark is two source characters. Keep both. The JSON encoding is: ${EXAMPLE_LITERAL_BACKSLASH_QUOTE}`,
  `Repeated control markers stay repeated: ${EXAMPLE_BLEEP}`,
  "These examples are labeled illustrations. They are not source strings to translate.",
  "Do not invent speaker facts, relationships, or explanatory notes.",
].join("\n");
