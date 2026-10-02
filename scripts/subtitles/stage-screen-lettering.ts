import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { Shaper } from "../../src/rendering/font/shaper.ts";
import { decompressGfx, walkSwfTags, readU16Le } from "../../src/patch/gfx/swf.ts";
import { parseSwfRect } from "../../src/patch/gfx/rect.ts";
import { rebuildGfxFile } from "../../src/patch/gfx/rewrite.ts";
import { outlineHeading } from "../../src/patch/gfx/outline-heading.ts";
import { whiteShapeWithNonzeroFill } from "../../src/patch/gfx/nonzero-shape.ts";
import { parseDefineFont3Tag } from "../../src/patch/gfx/font3/parse.ts";
import { writeVerifiedPack } from "../../src/patch/stage/write-verified-pack.ts";
import { SCREEN_LETTERING } from "../../src/patch/games/brutal-legend/screen-lettering.ts";

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new Error("Usage: stage-screen-lettering.ts GAME_ROOT NEW_STAGE");
const gameRoot = path.resolve(root), out = path.resolve(output);
await mkdir(out); await mkdir(path.join(out, "packs"));
const header = "Win/Packs/Man_Gfx.~h";
const pack = await openBuddhaPack({ headerPath: path.join(gameRoot, header),
  payloadPath: path.join(gameRoot, "Win/Packs/Man_Gfx.~p") });
const replacements = [], fontResources = [];
const shaper = Shaper.open("assets/fonts/force.ttf");
try {
  for (const screen of new Set(SCREEN_LETTERING.map(x => x.screen))) {
    const identifier = `data/ui/${screen}/opt/${screen}.gfx`;
    const original = (await extractBuddhaEntry(pack, identifier)).bytes;
    const gfx = decompressGfx(original);
    if (gfx.version < 8) throw new Error("DefineShape4 requires SWF 8");
    const tags = walkSwfTags(gfx.body).tags;
    const changes = new Map<number, Uint8Array>(), types = new Map<number, number>();
    for (const item of SCREEN_LETTERING.filter(x => x.screen === screen)) {
      const tag = tags.find(t => t.type === 2 && readU16Le(t.data, 0) === item.character);
      if (!tag) throw new Error(`Missing ${screen} shape ${item.character}`);
      const shape = whiteShapeWithNonzeroFill(outlineHeading(tag.data, item.text, shaper,
        { widthFraction: 0.86, heightFraction: 0.70, centerYFraction: 0.5 }));
      if ("black" in item && item.black) {
        const rect = parseSwfRect(shape, 2);
        const rgbOffset = 2 + rect.bytes.length * 2 + 3;
        shape.fill(0, rgbOffset, rgbOffset + 3);
      }
      changes.set(tag.offset, shape); types.set(tag.offset, 83);
    }
    const bytes = rebuildGfxFile(original, changes, types);
    const after = walkSwfTags(decompressGfx(bytes).body).tags;
    if (tags.length !== after.length) throw new Error("Tag count changed");
    for (let i = 0; i < tags.length; i++) {
      const a = tags[i], b = after[i];
      if (!a || !b) throw new Error("Missing tag");
      if (b.type !== (types.get(a.offset) ?? a.type) || !Buffer.from(b.data).equals(changes.get(a.offset) ?? a.data))
        throw new Error(`Tag preservation failed in ${screen}`);
      if (a.type === 75 && ((a.data[2] ?? 0) & 0x80) !== 0)
        fontResources.push({ name: parseDefineFont3Tag(a.data).name, asset: identifier, verified: true, unchanged: true });
    }
    replacements.push({ identifier, bytes });
  }
} finally { shaper.destroy(); }
const files = await writeVerifiedPack(gameRoot, out, header, replacements);
await writeFile(path.join(out, "install-manifest.json"), JSON.stringify({ gameRoot, files,
  fontResourcesVerified: true, fontResources }, null, 2));
await writeFile(path.join(out, "report.json"), JSON.stringify({ lettering: SCREEN_LETTERING,
  unrelatedTagsUnchanged: true, moviesUnchanged: true, inGameVerified: false }, null, 2));
console.log(`Staged ${SCREEN_LETTERING.length} lettering replacements in ${replacements.length} assets`);
