import path from "node:path";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { payloadPathFromHeader } from "../../src/archive/companion-path.ts";
import { containsPrivateUse, unescapeCorpusText } from "../../src/patch/font/display-text.ts";
import { splitGameSegments } from "../../src/patch/font/game-segments.ts";
import { replacePersianGaf } from "../../src/patch/font/persian-gaf.ts";
import {
  BRUTAL_LEGEND_DEFAULT_ROOT,
  BRUTAL_LEGEND_DLC_PACK,
  BRUTAL_LEGEND_DLC_STRING_TABLE_ENTRY,
  BRUTAL_LEGEND_STRING_TABLE_ENTRY,
  BRUTAL_LEGEND_STRING_TABLE_PACK,
  BRUTAL_LEGEND_TRANSLATION_DIRS,
} from "../../src/patch/games/brutal-legend/config.ts";
import { decodeStringTable } from "../../src/resources/stringtable/decode.ts";
import { mergeTranslations } from "../../src/patch/translations/load.ts";
import { Shaper } from "../../src/rendering/font/shaper.ts";

const gameRoot = process.argv[2] ?? BRUTAL_LEGEND_DEFAULT_ROOT;
const translations = mergeTranslations(
  await Promise.all(
    BRUTAL_LEGEND_TRANSLATION_DIRS.map(async (file) => ({ path: file, raw: await Bun.file(file).json() })),
  ),
);

function open(relative: string) {
  return openBuddhaPack({
    headerPath: path.join(gameRoot, relative),
    payloadPath: path.join(gameRoot, payloadPathFromHeader(relative)),
  });
}

const main = decodeStringTable(
  (await extractBuddhaEntry(await open(BRUTAL_LEGEND_STRING_TABLE_PACK), BRUTAL_LEGEND_STRING_TABLE_ENTRY)).bytes,
);
const dlc = decodeStringTable(
  (await extractBuddhaEntry(await open(BRUTAL_LEGEND_DLC_PACK), BRUTAL_LEGEND_DLC_STRING_TABLE_ENTRY)).bytes,
);
const shaper = Shaper.open("assets/fonts/force.ttf", { expectedFamily: "Force" });
const cmap = shaper.cmap();
const missing = new Map<number, { count: number; ids: string[]; hex: string; char: string }>();

for (const record of [...main.records, ...dlc.records]) {
  const translation = translations.get(record.lineCode);
  if (translation === undefined || translation.text.length === 0) {
    continue;
  }
  if (containsPrivateUse(record.text) || containsPrivateUse(translation.text)) {
    continue;
  }
  const display = splitGameSegments(replacePersianGaf(unescapeCorpusText(translation.text)).text)
    .filter((segment) => segment.kind === "display")
    .map((segment) => segment.raw)
    .join("");
  for (const char of display) {
    const code = char.codePointAt(0);
    if (code === undefined || code === 10 || code === 13 || code === 9) {
      continue;
    }
    if ((cmap.get(code) ?? 0) !== 0) {
      continue;
    }
    const row = missing.get(code) ?? { count: 0, ids: [], hex: code.toString(16), char };
    row.count += 1;
    if (row.ids.length < 8) {
      row.ids.push(record.lineCode);
    }
    missing.set(code, row);
  }
}
shaper.destroy();
const rows = [...missing.entries()].sort((left, right) => right[1].count - left[1].count);
await Bun.write("out/experiments/missing-force-glyphs.json", JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ missingCodes: rows.length, rows: rows.slice(0, 80) }, null, 2));
