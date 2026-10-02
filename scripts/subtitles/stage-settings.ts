import { parseTranslationArgs } from "./cli/translation-args.ts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { payloadPathFromHeader } from "../../src/archive/companion-path.ts";
import { decodeStringTable } from "../../src/resources/stringtable/decode.ts";
import { LayoutEngine } from "../../src/rendering/engine.ts";
import { planPuaGameText } from "../../src/patch/font/pua-game-text.ts";
import { remapToInstalledGlyphs } from "../../src/patch/font/remap-glyphs.ts";
import { missingGlyphs } from "../../src/patch/font/missing-glyphs.ts";
import { appendGlyphsToNamedFonts } from "../../src/patch/stage/append-fonts.ts";
import { loadTranslations } from "../../src/patch/translations/load.ts";
import { parseDefineFont3Tag } from "../../src/patch/gfx/font3/parse.ts";
import { parseDefineEditText } from "../../src/patch/gfx/edit-text.ts";
import { decompressGfx, walkSwfTags, readU16Le } from "../../src/patch/gfx/swf.ts";
import { rebuildGfxFile } from "../../src/patch/gfx/rewrite.ts";
import { outlineHeading } from "../../src/patch/gfx/outline-heading.ts";
import { replaceStringTableTexts } from "../../src/patch/stringtable/replace.ts";
import { writeVerifiedPack } from "../../src/patch/stage/write-verified-pack.ts";
import { SETTINGS_TEXT, SETTINGS_MAIN_IDS, SETTINGS_STATIC_TEXT, settingsProfile } from "../../src/games/brutal-legend/menu/settings-text.ts";
import { BRUTAL_LEGEND_GFX_PACK, BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_STRING_TABLE_PACK, BRUTAL_LEGEND_STRING_TABLE_ENTRY } from "../../src/games/brutal-legend/config.ts";

const usage = "Usage: stage-settings.ts GAME_ROOT NEW_STAGE --translations <file> [--translations <file> ...]";
const args = parseTranslationArgs(process.argv.slice(2), { usage, minPositionals: 2, maxPositionals: 2 });
const [root, output] = args.positionals;
if (!root || !output) throw new Error(usage);
const translationInputs = await loadTranslations(args.translations);
const translations = translationInputs.translations;
// This named first layer preserves the settings-specific text before file inputs.
const settingsOverrides = new Map(Object.entries(SETTINGS_TEXT));
const selectedTranslationSources = new Map<string, string>();
const gameRoot = path.resolve(root), out = path.resolve(output);
await mkdir(path.dirname(out), { recursive: true }); await mkdir(out); await mkdir(path.join(out, "packs"));
const open = (header: string) => openBuddhaPack({ headerPath: path.join(gameRoot, header),
  payloadPath: path.join(gameRoot, payloadPathFromHeader(header)) });
const strings = await open(BRUTAL_LEGEND_STRING_TABLE_PACK), gfx = await open(BRUTAL_LEGEND_GFX_PACK);
const pcEntry = "stringtable/blpc_enus", pauseEntry = "data/ui/pause/opt/pause.gfx";
const pcBytes = (await extractBuddhaEntry(strings, pcEntry)).bytes;
const pc = decodeStringTable(pcBytes);
const mainBytes = (await extractBuddhaEntry(strings, BRUTAL_LEGEND_STRING_TABLE_ENTRY)).bytes;
const requests = [...pc.records.map(r => r.lineCode), ...SETTINGS_MAIN_IDS].map(id => {
  const override = settingsOverrides.get(id);
  const translation = translations.get(id);
  const text = override ?? translation?.text;
  if (!text) throw new Error(`Missing translation ${id}`);
  if (override !== undefined) selectedTranslationSources.set(id, "SETTINGS_TEXT");
  else if (translation !== undefined) selectedTranslationSources.set(id, translation.sourceFile);
  return { id, text, profile: settingsProfile(id, text) };
});
for (const field of SETTINGS_STATIC_TEXT) requests.push({ id: `static-${field.field}`, text: field.text,
  profile: { width: field.width, height: 30, fontSize: field.fontSize } });
const fontBytes = (await extractBuddhaEntry(gfx, BRUTAL_LEGEND_FONTS_GFX_ENTRY)).bytes;
const fonts = walkSwfTags(decompressGfx(fontBytes).body).tags.filter(t => t.type === 75).map(t => parseDefineFont3Tag(t.data));
const donor = fonts.find(f => f.name === "TG_Condensed");
if (!donor) throw new Error("Missing donor font");
const pause = (await extractBuddhaEntry(gfx, pauseEntry)).bytes;
const tags = walkSwfTags(decompressGfx(pause).body).tags;
const { engine, shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
const patchedTags = new Map<number, Uint8Array>();
let plan;
try {
  plan = planPuaGameText(engine, requests, 0xe800);
  const heading = tags.find(t => t.type === 2 && readU16Le(t.data, 0) === 119);
  if (!heading) throw new Error("English OPTIONS vector heading missing");
  patchedTags.set(heading.offset, outlineHeading(heading.data, "الخيارات", shaper));
} finally { shaper.destroy(); }
const installed = donor.glyphs.filter(g => g.code >= 0xe0b6);
const added = missingGlyphs(plan.glyphs, installed, Math.max(...fonts.flatMap(f => f.glyphs.map(g => g.code))) + 1);
const nextFonts = appendGlyphsToNamedFonts(fontBytes, fonts.map(f => f.name), added).next;
const remap = remapToInstalledGlyphs(plan.glyphs, [...installed, ...added]);
const labels = plan.labels.map(l => ({ ...l, encoded: remap(l.encoded) }));
const byId = new Map(labels.map(l => [l.id, l]));
for (const font of fonts) {
  const codes = new Set([...font.glyphs, ...added].map(g => g.code));
  for (const label of labels) for (const char of label.encoded) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0xe000 && !codes.has(code)) throw new Error(`${font.name} misses ${label.id} glyph`);
  }
}
for (const field of SETTINGS_STATIC_TEXT) {
  const tag = tags.find(t => t.type === 37 && parseDefineEditText(t.data).id === field.field);
  const label = byId.get(`static-${field.field}`);
  if (!tag || !label || label.layout.lines.length !== 1) throw new Error("Static settings label mismatch");
  const edit = parseDefineEditText(tag.data);
  if (edit.fontHeight !== field.fontSize * 20) throw new Error("Static font size changed");
  const initial = new TextEncoder().encode(edit.initial);
  const start = tag.data.length - initial.length - 1;
  if (new TextDecoder().decode(tag.data.subarray(start, -1)) !== edit.initial) throw new Error("Unexpected EditText suffix");
  const html = `<p align="center"><font face="$Menu" size="${field.fontSize}" color="#ffffff" letterSpacing="0" kerning="0">${label.encoded}</font></p>`;
  const encoded = new TextEncoder().encode(html);
  const next = new Uint8Array(start + encoded.length + 1);
  next.set(tag.data.subarray(0, start)); next.set(encoded, start);
  if (parseDefineEditText(next).initial !== html) throw new Error("Static label round trip failed");
  patchedTags.set(tag.offset, next);
}
const nextPause = rebuildGfxFile(pause, patchedTags);
const pcLabels = pc.records.map(r => {
  const label = byId.get(r.lineCode); if (!label) throw new Error(`Missing encoded ${r.lineCode}`);
  return { lineCode: r.lineCode, text: label.encoded };
});
const mainLabels = SETTINGS_MAIN_IDS.map(id => {
  const label = byId.get(id); if (!label) throw new Error(`Missing encoded ${id}`);
  return { lineCode: id, text: label.encoded };
});
const files = [
  ...await writeVerifiedPack(gameRoot, out, BRUTAL_LEGEND_STRING_TABLE_PACK, [
    { identifier: pcEntry, bytes: replaceStringTableTexts(pcBytes, pcLabels).bytes },
    { identifier: BRUTAL_LEGEND_STRING_TABLE_ENTRY, bytes: replaceStringTableTexts(mainBytes, mainLabels).bytes },
  ]),
  ...await writeVerifiedPack(gameRoot, out, BRUTAL_LEGEND_GFX_PACK, [
    { identifier: pauseEntry, bytes: nextPause },
    { identifier: BRUTAL_LEGEND_FONTS_GFX_ENTRY, bytes: nextFonts },
  ]),
];
await writeFile(path.join(out, "install-manifest.json"), JSON.stringify({ gameRoot, files,
  fontResourcesVerified: true, fontResources: fonts.map(f => ({ name: f.name, verified: true })) }, null, 2));
await writeFile(path.join(out, "report.json"), JSON.stringify({ inGameVerified: false,
  translationFileProvenance: translationInputs.provenance,
  translationLayers: [{ kind: "overrides", name: "SETTINGS_TEXT", translations: SETTINGS_TEXT },
    ...translationInputs.provenance.inputs],
  selectedTranslationSources: Object.fromEntries(selectedTranslationSources),
  pcRecords: pcLabels.length, correctedMainRecords: mainLabels.length, optionsHeading: "الخيارات", addedGlyphs: added.length,
  staticFields: SETTINGS_STATIC_TEXT, movieArtworkUntouched: true,
  labels: labels.map(l => ({ id: l.id, logical: l.logical, encoded: l.encoded, widths: l.widths,
    lines: l.layout.lines.map(line => line.runs.map(r => r.tokenRaw ?? r.text)) })) }, null, 2));
console.log(`Staged ${pcLabels.length} PC strings, ${mainLabels.length} slider labels, two static labels and OPTIONS heading. ${out}`);
