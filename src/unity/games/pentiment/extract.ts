import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parsePentimentTables, stringId } from "./string-tables.ts";
import { assertArtifactOutsideGame } from "../../paths.ts";

export const PENTIMENT_ENGLISH = "Pentiment_Data/StreamingAssets/localized/enus/text/text_enus.stringtablebundle";
const CONTEXT = "Pentiment, a historical narrative game in 16th-century Bavaria. Use natural Modern Standard Arabic appropriate to historical dialogue, religious debate and manuscript art. Do not modernize historical institutions. Andreas Maler = أندرياس مالر; Magdalene = ماغدالينا; Tassing = تاسينغ; Kiersau = كيرساو. Preserve any opaque protected markers exactly; they encode game formatting, not words to interpret.";

export async function extractPentiment(root: string, out: string): Promise<void> {
  await assertArtifactOutsideGame(root, out);
  const bytes = await readFile(path.join(root, PENTIMENT_ENGLISH));
  const source = parsePentimentTables(JSON.parse(bytes.toString("utf8")));
  const records = source.StringTables.flatMap((table, entryIndex) => table.Entries.map(entry => ({
    archiveHeader: PENTIMENT_ENGLISH, entryType: "StringTable", entryName: table.Name, entryIndex,
    recordId: stringId(table.Name, entry.ID), text: entry.DefaultText,
    context: `${CONTEXT} Table: ${table.Name}.`,
    extra: { engine: "unity", adapter: "pentiment-json-v1", field: "DefaultText", numericId: entry.ID },
  })));
  await mkdir(out, { recursive: false });
  await writeFile(path.join(out, "strings.json"), JSON.stringify(records, null, 2));
  await writeFile(path.join(out, "source.stringtablebundle"), bytes);
  await writeFile(path.join(out, "extraction.json"), JSON.stringify({ schemaVersion: 1, game: "pentiment",
    root: path.resolve(root), file: PENTIMENT_ENGLISH, sha256: createHash("sha256").update(bytes).digest("hex"),
    tables: source.StringTables.length, records: records.length,
    empty: records.filter(record => !record.text.trim()).length, inGameVerified: false }, null, 2));
}
