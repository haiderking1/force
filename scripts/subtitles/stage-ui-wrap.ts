import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { payloadPathFromHeader } from "../../src/archive/companion-path.ts";
import { LayoutEngine } from "../../src/rendering/engine.ts";
import { planPuaGameText } from "../../src/patch/font/pua-game-text.ts";
import { remapToInstalledGlyphs } from "../../src/patch/font/remap-glyphs.ts";
import { parseDefineFont3Tag } from "../../src/patch/gfx/font3/parse.ts";
import { parseDefineEditText } from "../../src/patch/gfx/edit-text.ts";
import { parseSwfRect } from "../../src/patch/gfx/rect.ts";
import { decompressGfx, walkSwfTags } from "../../src/patch/gfx/swf.ts";
import { replaceStringTableTexts } from "../../src/patch/stringtable/replace.ts";
import { writeVerifiedPack } from "../../src/patch/stage/write-verified-pack.ts";
import { UI_TEXT_CORRECTIONS } from "../../src/games/brutal-legend/text/ui-corrections.ts";
import { BRUTAL_LEGEND_GFX_PACK, BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_STRING_TABLE_PACK, BRUTAL_LEGEND_STRING_TABLE_ENTRY } from "../../src/games/brutal-legend/config.ts";

const [root, output, ...extra] = process.argv.slice(2);
if (!root || !output || extra.length) throw new Error("Usage: stage-ui-wrap.ts GAME_ROOT NEW_STAGE");
const gameRoot = path.resolve(root), out = path.resolve(output);
await mkdir(path.dirname(out), { recursive: true });
await mkdir(out);
const open = (relative: string) => openBuddhaPack({ headerPath: path.join(gameRoot, relative),
  payloadPath: path.join(gameRoot, payloadPathFromHeader(relative)) });
const gfx = await open(BRUTAL_LEGEND_GFX_PACK);
const fontBytes = (await extractBuddhaEntry(gfx, BRUTAL_LEGEND_FONTS_GFX_ENTRY)).bytes;
const fonts = walkSwfTags(decompressGfx(fontBytes).body).tags.filter(t => t.type === 75)
  .map(t => parseDefineFont3Tag(t.data));
const donor = fonts.find(f => f.name === "TG_Condensed");
if (!donor) throw new Error("Installed donor font missing");
const { engine, shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
const plan = (() => {
  try { return planPuaGameText(engine, UI_TEXT_CORRECTIONS, 0xe800); }
  finally { shaper.destroy(); }
})();
const remap = remapToInstalledGlyphs(plan.glyphs, donor.glyphs.filter(g => g.code >= 0xe0b6));
const labels = plan.labels.map(label => ({ ...label, encoded: remap(label.encoded) }));
for (const config of UI_TEXT_CORRECTIONS) {
  const label = labels.find(l => l.id === config.id);
  if (!label || label.layout.lines.length > config.maxLines) throw new Error(`${config.id}: too many lines`);
  const bytes = (await extractBuddhaEntry(gfx, config.asset)).bytes;
  const tags = walkSwfTags(decompressGfx(bytes).body).tags;
  const field = tags.find(t => t.type === 37 && parseDefineEditText(t.data).id === config.field);
  if (!field) throw new Error(`${config.id}: missing GFX field`);
  const edit = parseDefineEditText(field.data), rect = parseSwfRect(field.data, 2);
  if (edit.fontHeight !== config.profile.fontSize * 20 || config.profile.width >= (rect.xMax - rect.xMin) / 20) {
    throw new Error(`${config.id}: field profile changed`);
  }
  const font = config.family === "TG_Condensed" ? donor : tags.filter(t => t.type === 75)
    .map(t => parseDefineFont3Tag(t.data)).find(f => f.name === config.family);
  if (!font) throw new Error(`${config.id}: font missing`);
  const codes = new Set(font.glyphs.map(g => g.code));
  for (const char of label.encoded) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0xe000 && !codes.has(code)) throw new Error(`${config.id}: missing installed glyph`);
  }
  if (config.id === "AAAY054TEXT" && !label.encoded.includes("/RockStance/")) throw new Error("Lost binding");
}
const pack = await open(BRUTAL_LEGEND_STRING_TABLE_PACK);
const table = (await extractBuddhaEntry(pack, BRUTAL_LEGEND_STRING_TABLE_ENTRY)).bytes;
const replaced = replaceStringTableTexts(table, labels.map(l => ({ lineCode: l.id, text: l.encoded })));
const replacements = [{ identifier: BRUTAL_LEGEND_STRING_TABLE_ENTRY, bytes: replaced.bytes }];
const files = await writeVerifiedPack(gameRoot, out, BRUTAL_LEGEND_STRING_TABLE_PACK, replacements,
  { createPacksDirectory: true });
await writeFile(path.join(out, "install-manifest.json"), JSON.stringify({ gameRoot, files,
  fontResourcesVerified: true, fontResources: [{ name: "Installed TG_Condensed and MTL-150", verified: true }] }, null, 2));
await writeFile(path.join(out, "report.json"), JSON.stringify({ inGameVerified: false,
  fontsAndArtworkUntouched: true, labels: labels.map(l => ({ id: l.id, text: l.logical,
    encoded: l.encoded, widths: l.widths, lines: l.layout.lines.map(line => line.runs.map(r => r.tokenRaw ?? r.text)) })) }, null, 2));
console.log(`Verified and staged ${labels.length} UI corrections in ${out}`);
