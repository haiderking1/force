import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parsePentimentTables, replacePentimentText } from "../../../../src/unity/games/pentiment/string-tables.ts";
import { assertArtifactOutsideGame } from "../../../../src/unity/paths.ts";
import { isRecord } from "../../../../src/translation/unknown.ts";

const [root, sourceFile, encodedFile, glyphFile, output] = process.argv.slice(2);
if (!root || !sourceFile || !encodedFile || !glyphFile || !output)
  throw new Error("Usage: stage-static-text.ts GAME SOURCE_TABLE ENCODED.json GLYPHS.json NEW_STAGE");
await assertArtifactOutsideGame(root, output);
const relative = "Pentiment_Data/StreamingAssets/localized/enus/text/text_enus.stringtablebundle";
const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const source = await readFile(sourceFile);
if (hash(source) !== hash(await readFile(path.join(root, relative)))) throw new Error("Live table differs from source snapshot");
const tables = parsePentimentTables(JSON.parse(source.toString("utf8")));
const encoded: unknown = JSON.parse(await readFile(encodedFile, "utf8"));
const glyphs: unknown = JSON.parse(await readFile(glyphFile, "utf8"));
if (!isRecord(encoded) || !Array.isArray(encoded.encoded) || !Array.isArray(encoded.blockers) || encoded.blockers.length
  || !isRecord(glyphs) || !Array.isArray(glyphs.glyphs)
  || typeof encoded.inputSha256 !== "string" || typeof encoded.fontSha256 !== "string"
  || encoded.inputSha256 !== glyphs.inputSha256 || encoded.fontSha256 !== glyphs.fontSha256)
  throw new Error("Incomplete encoding or mismatched glyph provenance");
const codes = new Set<number>();
for (const glyph of glyphs.glyphs) {
  if (!isRecord(glyph) || typeof glyph.code !== "number" || codes.has(glyph.code)) throw new Error("Invalid glyph allocation");
  codes.add(glyph.code);
}
const replacements = new Map<string, string>();
for (const row of encoded.encoded) {
  if (!isRecord(row) || typeof row.id !== "string" || typeof row.encoded !== "string" || replacements.has(row.id))
    throw new Error("Invalid encoded row");
  for (const char of row.encoded) {
    const code = char.codePointAt(0);
    if (code !== undefined && code >= 0xe000 && code <= 0xf8ff && !codes.has(code)) throw new Error("Unmapped PUA glyph");
  }
  if (/\p{Script=Arabic}/u.test(row.encoded)) throw new Error("Unencoded Arabic remains");
  replacements.set(row.id, row.encoded);
}
if (!replacements.size) throw new Error("No encoded replacements");
const result = replacePentimentText(tables, replacements);
const bytes = Buffer.from(JSON.stringify(result));
if (JSON.stringify(parsePentimentTables(JSON.parse(bytes.toString("utf8")))) !== JSON.stringify(result))
  throw new Error("Table round-trip mismatch");
await mkdir(output, { recursive: false });
await mkdir(path.dirname(path.join(output, "files", relative)), { recursive: true });
await writeFile(path.join(output, "files", relative), bytes);
await writeFile(path.join(output, "stage.json"), JSON.stringify({
  schemaVersion: 1, engine: "unity", root: path.resolve(root), processNames: ["Pentiment", "Pentiment.exe"],
  files: [{ path: relative, originalSha256: hash(source), stagedSha256: hash(bytes), bytes: bytes.length }],
  encodedEntries: replacements.size, encodedSha256: hash(await readFile(encodedFile)), glyphsSha256: hash(await readFile(glyphFile)),
  installReady: false, inGameVerified: false,
  blockers: ["Static labels only. Other entries retain source text. Runtime layout and writing effects need in-game verification."],
}, null, 2));
console.log(`Staged ${replacements.size} encoded labels with matching glyph coverage`);
