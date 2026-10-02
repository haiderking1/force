import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { payloadPathFromHeader } from "../../src/archive/companion-path.ts";
import { parseDefineFont3Tag } from "../../src/patch/gfx/font3/parse.ts";
import { extendEmbeddedFonts } from "../../src/patch/gfx/font3/extend-embedded.ts";
import { decompressGfx, walkSwfTags } from "../../src/patch/gfx/swf.ts";
import { writeVerifiedPack } from "../../src/patch/stage/write-verified-pack.ts";
import { sha256Bytes } from "../../src/patch/hash.ts";
import { BRUTAL_LEGEND_GFX_PACK, BRUTAL_LEGEND_FONTS_GFX_ENTRY } from "../../src/games/brutal-legend/config.ts";
import { GAME_TEXT_GLYPH_FIRST, GAME_TEXT_GLYPH_COUNT, EMBEDDED_TEXT_FAMILIES,
  MIN_EMBEDDED_GLYPHS } from "../../src/games/brutal-legend/rendering/embedded-fonts.ts";

const [root, output, ...extra] = process.argv.slice(2);
if (!root || !output || extra.length) throw new Error("Usage: stage-embedded-fonts.ts GAME_ROOT NEW_STAGE");
const gameRoot = path.resolve(root);
const out = path.resolve(output);
await mkdir(path.dirname(out), { recursive: true });
await mkdir(out);
const headerPath = path.join(gameRoot, BRUTAL_LEGEND_GFX_PACK);
const payloadPath = payloadPathFromHeader(headerPath);
const pack = await openBuddhaPack({ headerPath, payloadPath });
const donorBytes = (await extractBuddhaEntry(pack, BRUTAL_LEGEND_FONTS_GFX_ENTRY)).bytes;
const donors = walkSwfTags(decompressGfx(donorBytes).body).tags.filter((tag) => tag.type === 75)
  .map((tag) => parseDefineFont3Tag(tag.data)).filter((font) => font.name === "TG_Condensed");
const donor = donors[0];
if (!donor || donors.length !== 1) throw new Error("Missing unique installed TG_Condensed donor");
const glyphs = donor.glyphs.filter((glyph) => glyph.code >= GAME_TEXT_GLYPH_FIRST && glyph.code <= 0xf8ff);
if (glyphs.length !== GAME_TEXT_GLYPH_COUNT || glyphs.some((glyph, i) => glyph.code !== GAME_TEXT_GLYPH_FIRST + i)) {
  throw new Error("Installed font differs from game-text-v1 allocation; refusing mismatched donor");
}
const replacements: { identifier: string; bytes: Uint8Array }[] = [];
const resources: { asset: string; name: string; id: number; added: number; verified: boolean }[] = [];
const inventory: { asset: string; fonts: { name: string; glyphs: number; selected: boolean }[] }[] = [];
for (const entry of pack.entries) {
  if (!entry.identifier.endsWith(".gfx") || entry.identifier === BRUTAL_LEGEND_FONTS_GFX_ENTRY) continue;
  const bytes = (await extractBuddhaEntry(pack, entry.identifier)).bytes;
  const fonts = walkSwfTags(decompressGfx(bytes).body).tags.filter(
    (tag) => tag.type === 75 && ((tag.data[2] ?? 0) & 0x80) !== 0)
    .map((tag) => parseDefineFont3Tag(tag.data));
  const select = (font: typeof donor) => EMBEDDED_TEXT_FAMILIES.has(font.name) && font.glyphs.length >= MIN_EMBEDDED_GLYPHS;
  inventory.push({ asset: entry.identifier, fonts: fonts.map((font) => ({
    name: font.name, glyphs: font.glyphs.length, selected: select(font),
  })) });
  const next = extendEmbeddedFonts(bytes, select, glyphs);
  resources.push(...next.fonts.map((font) => ({ asset: entry.identifier, ...font })));
  if (next.changed) replacements.push({ identifier: entry.identifier, bytes: next.bytes });
}
if (!replacements.some((entry) => entry.identifier === "data/ui/tc_deuce/opt/tc_deuce.gfx")) {
  throw new Error("Expected unpatched Deuce tutorial font was not found");
}
await mkdir(path.join(out, "packs"));
const files = await writeVerifiedPack(gameRoot, out, BRUTAL_LEGEND_GFX_PACK, replacements);
await writeFile(path.join(out, "install-manifest.json"), JSON.stringify({ gameRoot, files,
  fontResourcesVerified: true, fontResources: resources }, null, 2));
await writeFile(path.join(out, "report.json"), JSON.stringify({ inGameVerified: false,
  donorSha256: sha256Bytes(donorBytes), firstCode: GAME_TEXT_GLYPH_FIRST, glyphCount: glyphs.length,
  changedAssets: replacements.map((entry) => entry.identifier), resources, inventory,
  existingGlyphsPreserved: true, nonFontTagsPreserved: true, untouchedPackEntriesVerified: true,
  movieFilesUntouched: true, stringTablesUntouched: true }, null, 2));
console.log(`Verified ${resources.length} embedded fonts across ${replacements.length} GFX assets. Stage: ${out}`);
