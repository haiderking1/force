import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isRecord } from "../../../translation/unknown.ts";
import { validateTranslations } from "../../../translation/response.ts";
import { collectPlaceholderTokens } from "../../../translation/tokens/scan.ts";
import { parsePentimentTables, replacePentimentText, stringId } from "./string-tables.ts";
import { PENTIMENT_ENGLISH } from "./extract.ts";
import { assertArtifactOutsideGame } from "../../paths.ts";
import { correctPentimentText } from "./corrections.ts";

const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Rebuild the complete logical Arabic table. Rendering approval is separate. */
export async function stagePentimentText(root: string, corpus: string, translated: string, out: string): Promise<void> {
  await assertArtifactOutsideGame(root, out);
  const snapshot = await readFile(path.join(corpus, "source.stringtablebundle"));
  const live = await readFile(path.join(root, PENTIMENT_ENGLISH));
  if (hash(snapshot) !== hash(live)) throw new Error("Pentiment English table changed since extraction");
  const original = parsePentimentTables(JSON.parse(snapshot.toString("utf8")));
  const items = original.StringTables.flatMap(table => table.Entries.map(entry => ({ id: stringId(table.Name, entry.ID), text: entry.DefaultText })));
  const raw: unknown = JSON.parse(await readFile(translated, "utf8"));
  if (!isRecord(raw) || !Array.isArray(raw.translations)) throw new Error("Expected assembled translations with source provenance");
  const sourceById = new Map(items.map(item => [item.id, item.text]));
  for (const row of raw.translations) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.text !== "string" || row.sourceText !== sourceById.get(row.id)
      || (typeof row.sourceText === "string" && row.sourceText.length > 0 && row.text.length === 0))
      throw new Error("Translation source provenance mismatch");
  }
  const request = { targetLanguage: "ar", items, placeholders: collectPlaceholderTokens(items.map(item => item.text)) };
  const validated = validateTranslations(raw, request);
  const corrections: { id: string; before: string; after: string }[] = [];
  const translations = validated.map(item => {
    const source = sourceById.get(item.id);
    if (source === undefined) throw new Error("Validated translation lost its source");
    const text = correctPentimentText(source, item.text);
    if (text !== item.text) corrections.push({ id: item.id, before: item.text, after: text });
    return { ...item, text };
  });
  validateTranslations({ translations }, request);
  const replacements = new Map(translations.map(item => [item.id, item.text]));
  const result = replacePentimentText(original, replacements);
  const bytes = Buffer.from(JSON.stringify(result));
  const roundTrip = parsePentimentTables(JSON.parse(bytes.toString("utf8")));
  if (JSON.stringify(roundTrip) !== JSON.stringify(result)) throw new Error("String-table round-trip mismatch");
  await mkdir(out, { recursive: false });
  const target = path.join(out, "files", PENTIMENT_ENGLISH);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  const report = { tables: result.StringTables.length, translatedEntries: translations.length,
    unchangedText: translations.filter(item => item.text === sourceById.get(item.id)).map(item => item.id),
    sourceSha256: hash(snapshot), outputSha256: hash(bytes), idsAndMetadataPreserved: true, tokensVerified: true,
    rendering: "logical Unicode only; not approved for the game's renderer", inGameVerified: false };
  await writeFile(path.join(out, "text-report.json"), JSON.stringify({ ...report, corrections: corrections.length }, null, 2));
  await writeFile(path.join(out, "corrections.json"), JSON.stringify(corrections, null, 2));
  await writeFile(path.join(out, "stage.json"), JSON.stringify({ schemaVersion: 1, engine: "unity", game: "pentiment",
    root: path.resolve(root), processNames: ["Pentiment", "Pentiment.exe"],
    files: [{ path: PENTIMENT_ENGLISH, originalSha256: hash(snapshot), stagedSha256: hash(bytes), bytes: bytes.length }],
    installReady: false, inGameVerified: false, blockers: ["Runtime Arabic shaping, dynamic wrapping, and custom writing effects require verification"] }, null, 2));
}
