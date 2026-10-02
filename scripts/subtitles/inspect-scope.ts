import { parseTranslationArgs } from "./cli/translation-args.ts";
import path from "node:path";
import { resolveBrutalLegendRoot } from "../../src/games/brutal-legend/root.ts";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { payloadPathFromHeader } from "../../src/archive/companion-path.ts";
import { decodeVidSubtitles } from "../../src/resources/subtitles/decode.ts";
import { decodeStringTable } from "../../src/resources/stringtable/decode.ts";
import { parseDefineEditText } from "../../src/patch/gfx/edit-text.ts";
import { parseSwfRect } from "../../src/patch/gfx/rect.ts";
import { decompressGfx, walkSwfTags, SWF_TAG_NAMES } from "../../src/patch/gfx/swf.ts";
import { walkSpriteTags } from "../../src/patch/gfx/sprite-tags.ts";
import { parseDefineFont3Tag } from "../../src/patch/gfx/font3/parse.ts";
import { loadTranslations } from "../../src/patch/translations/load.ts";
import { tokenizeGameSyntax } from "../../src/rendering/syntax/tokens.ts";
import { collectTokensInText } from "../../src/translation/tokens/scan.ts";
import { Shaper } from "../../src/rendering/font/shaper.ts";
import {
  BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_GFX_PACK,
  BRUTAL_LEGEND_STRING_TABLE_ENTRY,
  BRUTAL_LEGEND_STRING_TABLE_PACK,
} from "../../src/games/brutal-legend/config.ts";
import { SUBTITLE_ASSET, SUBTITLE_TIMING_PACK } from "../../src/games/brutal-legend/rendering/subtitle-profile.ts";

const args = parseTranslationArgs(process.argv.slice(2), {
  usage: "Usage: inspect-scope.ts [GAME_ROOT] --translations <file> [--translations <file> ...] --corpus <file>",
  minPositionals: 0,
  maxPositionals: 1,
  allowCorpus: true,
});
if (args.corpus === undefined) throw new Error("inspect-scope.ts requires --corpus <file>");
const corpusPath = path.resolve(args.corpus);
const gameRoot = resolveBrutalLegendRoot(process.env, args.positionals[0]);

function open(relative: string) {
  const headerPath = path.join(gameRoot, relative);
  return openBuddhaPack({ headerPath, payloadPath: path.join(gameRoot, payloadPathFromHeader(relative)) });
}

function twipsToPx(value: number): number {
  return value / 20;
}

const translationInputs = await loadTranslations(args.translations);
const translations = translationInputs.translations;

const timingPack = await open(SUBTITLE_TIMING_PACK);
const subtitleEntries = timingPack.entries.filter((entry) => (entry.name ?? entry.identifier).startsWith("gameplay/subtitles/"));
const cueById = new Map<string, { entries: string[]; startFrame?: string; length?: string }>();
const entryCueCounts: { entry: string; cues: number; unique: number }[] = [];
for (const entry of subtitleEntries) {
  const extracted = await extractBuddhaEntry(timingPack, entry.identifier);
  const decoded = decodeVidSubtitles(extracted.bytes);
  const ids = new Set<string>();
  for (const record of decoded.records) {
    ids.add(record.lineCode);
    const existing = cueById.get(record.lineCode);
    if (existing === undefined) {
      cueById.set(record.lineCode, {
        entries: [entry.identifier],
        startFrame: record.startFrame,
        length: record.length,
      });
    } else if (!existing.entries.includes(entry.identifier)) {
      existing.entries.push(entry.identifier);
    }
  }
  entryCueCounts.push({ entry: entry.identifier, cues: decoded.records.length, unique: ids.size });
}

const gfx = await open(BRUTAL_LEGEND_GFX_PACK);
const subtitleBytes = (await extractBuddhaEntry(gfx, SUBTITLE_ASSET)).bytes;
const fontsBytes = (await extractBuddhaEntry(gfx, BRUTAL_LEGEND_FONTS_GFX_ENTRY)).bytes;
const subtitleGfx = decompressGfx(subtitleBytes);
const subtitleWalk = walkSwfTags(subtitleGfx.body);
const stageRect = parseSwfRect(subtitleGfx.body, 0);

const editTexts = subtitleWalk.tags
  .filter((tag) => tag.type === 37)
  .map((tag) => {
    const edit = parseDefineEditText(tag.data);
    const bounds = parseSwfRect(tag.data, 2);
    return {
      id: edit.id,
      fontFace: edit.fontFace,
      fontClass: edit.fontClass,
      fontId: edit.fontId,
      fontHeight: edit.fontHeight,
      align: edit.align,
      html: edit.html,
      variable: edit.variable,
      initial: edit.initial.slice(0, 80),
      widthTwips: bounds.xMax - bounds.xMin,
      heightTwips: bounds.yMax - bounds.yMin,
      xMin: bounds.xMin,
      xMax: bounds.xMax,
      yMin: bounds.yMin,
      yMax: bounds.yMax,
      widthPx: twipsToPx(bounds.xMax - bounds.xMin),
      heightPx: twipsToPx(bounds.yMax - bounds.yMin),
      fontPx: edit.fontHeight === undefined ? undefined : edit.fontHeight / 20,
    };
  });

const frameLabels = subtitleWalk.tags
  .filter((tag) => tag.type === 43)
  .map((tag) => new TextDecoder("latin1").decode(tag.data.subarray(0, tag.data.indexOf(0))));

const sprites = subtitleWalk.tags
  .filter((tag) => tag.type === 39)
  .map((tag) => {
    const { id, frameCount, tags: inner } = walkSpriteTags(tag.data);
    return {
      id,
      frameCount,
      tagTypes: inner.map((item) => SWF_TAG_NAMES[item.type] ?? String(item.type)),
      labels: inner
        .filter((item) => item.type === 43)
        .map((item) => new TextDecoder("latin1").decode(item.data.subarray(0, item.data.indexOf(0)))),
    };
  });

const placeObjects = subtitleWalk.tags
  .filter((tag) => tag.type === 26 || tag.type === 70)
  .map((tag) => ({ type: tag.type, length: tag.length, offset: tag.offset, head: [...tag.data.subarray(0, Math.min(24, tag.data.length))] }));

const fontTags = walkSwfTags(decompressGfx(fontsBytes).body).tags.filter((tag) => tag.type === 75).map((tag) => {
  const font = parseDefineFont3Tag(tag.data);
  const codes = font.glyphs.map((glyph) => glyph.code);
  const pua = codes.filter((code) => code >= 0xe000 && code <= 0xf8ff);
  return {
    name: font.name,
    id: font.id,
    glyphCount: font.glyphs.length,
    codeMin: Math.min(...codes),
    codeMax: Math.max(...codes),
    puaCount: pua.length,
    puaMin: pua.length === 0 ? undefined : Math.min(...pua),
    puaMax: pua.length === 0 ? undefined : Math.max(...pua),
  };
});

const mainTable = decodeStringTable(
  (await extractBuddhaEntry(await open(BRUTAL_LEGEND_STRING_TABLE_PACK), BRUTAL_LEGEND_STRING_TABLE_ENTRY)).bytes,
);

const dlcHeader = "Win/Packs/DLC1_Stuff.~h";
let dlcTable:
  | { entry: string; records: number; ids: string[] }
  | undefined;
try {
  const dlcPack = await open(dlcHeader);
  const dlcEntry = dlcPack.entries.find((entry) => entry.identifier === "stringtable/bl1dlc1_enus");
  if (dlcEntry !== undefined) {
    const decoded = decodeStringTable((await extractBuddhaEntry(dlcPack, dlcEntry.identifier)).bytes);
    dlcTable = { entry: dlcEntry.identifier, records: decoded.records.length, ids: decoded.records.map((record) => record.lineCode) };
  }
} catch (error) {
  console.error("DLC pack:", error instanceof Error ? error.message : error);
}

const corpus = (await Bun.file(corpusPath).json()) as {
  recordId?: string;
  entryType?: string;
  text?: string;
  extra?: { soundCue?: string };
}[];

const shaper = Shaper.open("assets/fonts/force.ttf", { expectedFamily: "Force" });
const cmap = shaper.cmap();
const gafCodes = [0x06af, 0x06ac, 0x06ad, 0x06ae, 0x06a9, 0x0643, 0x0763, 0x08c3];
const forceGlyphs = Object.fromEntries(
  gafCodes.map((code) => [code.toString(16), cmap.get(code) ?? 0]),
);

const GAF = "\u06af";
const cueIds = [...cueById.keys()];
const spoken = mainTable.records.filter((record) => record.soundCue !== undefined && record.soundCue.length > 0);
const puaRe = /[\uE000-\uF8FF]/;
const alreadyPua = mainTable.records.filter((record) => puaRe.test(record.text));

function classify(text: string) {
  const tokens = collectTokensInText(text);
  const syntax = tokenizeGameSyntax(text);
  return {
    tokens,
    kinds: [...new Set(syntax.filter((token) => token.kind !== "text").map((token) => token.kind))],
    hasGaf: text.includes(GAF),
    hasArabic: /[\u0600-\u06FF]/.test(text),
    hasPua: puaRe.test(text),
  };
}

const cueStats = cueIds.map((id) => {
  const translation = translations.get(id);
  const table = mainTable.records.find((record) => record.lineCode === id);
  return {
    id,
    hasTranslation: translation !== undefined,
    translation: translation?.text,
    tableText: table?.text,
    soundCue: table?.soundCue,
    ...classify(translation?.text ?? ""),
  };
});

const missingCueTranslations = cueStats.filter((item) => !item.hasTranslation);
const cueWithTokens = cueStats.filter((item) => item.tokens.length > 0 || item.kinds.length > 0);
const cueWithGaf = cueStats.filter((item) => item.hasGaf);
const allGaf = [...translations.entries()].filter(([, row]) => row.text.includes(GAF));
const tokenKinds = new Map<string, number>();
for (const [id, row] of translations) {
  for (const token of collectTokensInText(row.text)) {
    tokenKinds.set(token, (tokenKinds.get(token) ?? 0) + 1);
  }
}
const topTokens = [...tokenKinds.entries()].sort((left, right) => right[1] - left[1]).slice(0, 40);

const remainingSpoken = spoken.filter((record) => !cueById.has(record.lineCode));
const remainingSpokenTranslated = remainingSpoken.filter((record) => translations.has(record.lineCode));

shaper.destroy();

const report = {
  translationProvenance: translationInputs.provenance,
  translations: translations.size,
  subtitleEntries: subtitleEntries.map((entry) => entry.identifier),
  entryCueCounts,
  uniqueCues: cueIds.length,
  totalCueJoins: entryCueCounts.reduce((sum, item) => sum + item.cues, 0),
  missingCueTranslations: missingCueTranslations.map((item) => item.id),
  cueWithTokens: cueWithTokens.map((item) => ({ id: item.id, tokens: item.tokens, kinds: item.kinds, text: item.translation })),
  cueWithGaf: cueWithGaf.map((item) => item.id),
  allGaf: allGaf.map(([id, row]) => ({ id, text: row.text })),
  topTokens,
  mainTable: { records: mainTable.records.length, spoken: spoken.length, alreadyPua: alreadyPua.length, alreadyPuaIds: alreadyPua.map((record) => record.lineCode) },
  remainingSpoken: { total: remainingSpoken.length, translated: remainingSpokenTranslated.length },
  dlcTable,
  corpus: { path: corpusPath, records: corpus.length, types: [...new Set(corpus.map((row) => row.entryType))] },
  subtitleGfx: {
    stage: { ...stageRect, widthPx: twipsToPx(stageRect.xMax - stageRect.xMin), heightPx: twipsToPx(stageRect.yMax - stageRect.yMin) },
    frameLabels,
    editTexts,
    sprites,
    placeObjectCount: placeObjects.length,
    placeObjectHeads: placeObjects.slice(0, 20),
    tagCounts: Object.fromEntries(
      [...subtitleWalk.tags.reduce((map, tag) => map.set(tag.type, (map.get(tag.type) ?? 0) + 1), new Map<number, number>())].map(
        ([type, count]) => [SWF_TAG_NAMES[type] ?? String(type), count],
      ),
    ),
  },
  fonts: fontTags,
  forceGlyphs,
};

await Bun.write("out/experiments/subtitle-scope-inspect.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  translations: report.translations,
  uniqueCues: report.uniqueCues,
  subtitleEntries: report.subtitleEntries.length,
  missingCueTranslations: report.missingCueTranslations.length,
  cueWithTokens: report.cueWithTokens.length,
  allGaf: report.allGaf.length,
  alreadyPua: report.mainTable.alreadyPua,
  remainingSpoken: report.remainingSpoken,
  dlcRecords: report.dlcTable?.records,
  editTexts: report.subtitleGfx.editTexts.map((edit) => ({
    id: edit.id,
    widthPx: edit.widthPx,
    heightPx: edit.heightPx,
    fontPx: edit.fontPx,
    fontFace: edit.fontFace,
    variable: edit.variable,
  })),
  fonts: report.fonts,
  forceGlyphs: report.forceGlyphs,
  stage: report.subtitleGfx.stage,
  frameLabels: report.subtitleGfx.frameLabels,
  sprites: report.subtitleGfx.sprites,
}, null, 2));
