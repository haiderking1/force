import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { Shaper } from "../../src/rendering/font/shaper.ts";
import { decompressGfx, walkSwfTags, readU16Le } from "../../src/patch/gfx/swf.ts";
import { rebuildGfxFile } from "../../src/patch/gfx/rewrite.ts";
import { outlineHeading } from "../../src/patch/gfx/outline-heading.ts";
import { parseDefineFont3Tag } from "../../src/patch/gfx/font3/parse.ts";
import { whiteShapeWithNonzeroFill } from "../../src/patch/gfx/nonzero-shape.ts";
import { writeVerifiedPack } from "../../src/patch/stage/write-verified-pack.ts";

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new Error("Usage: stage-settings-heading.ts GAME_ROOT NEW_STAGE");
const gameRoot = path.resolve(root), out = path.resolve(output);
await mkdir(out); await mkdir(path.join(out, "packs"));
const header = "Win/Packs/Man_Gfx.~h";
const pack = await openBuddhaPack({ headerPath: path.join(gameRoot, header),
  payloadPath: path.join(gameRoot, "Win/Packs/Man_Gfx.~p") });
const identifier = "data/ui/pause/opt/pause.gfx";
const original = (await extractBuddhaEntry(pack, identifier)).bytes;
const gfx = decompressGfx(original);
if (gfx.version < 8) throw new Error("DefineShape4 requires SWF 8 or later");
const tags = walkSwfTags(gfx.body).tags;
const heading = tags.find(t => t.type === 2 && readU16Le(t.data, 0) === 119);
if (!heading) throw new Error("Expected installed settings heading 119");
const shaper = Shaper.open("assets/fonts/force.ttf");
let replacement;
const fit = { widthFraction: 0.68, heightFraction: 0.60, centerYFraction: 0.37 };
try { replacement = whiteShapeWithNonzeroFill(outlineHeading(heading.data, "الخيارات", shaper, fit)); }
finally { shaper.destroy(); }
const next = rebuildGfxFile(original, new Map([[heading.offset, replacement]]), new Map([[heading.offset, 83]]));
const nextTags = walkSwfTags(decompressGfx(next).body).tags;
if (nextTags.length !== tags.length) throw new Error("Tag count changed");
for (let i = 0; i < tags.length; i++) {
  const before = tags[i], after = nextTags[i];
  if (!before || !after) throw new Error("Missing tag");
  if (before.offset === heading.offset) {
    if (after.type !== 83 || !Buffer.from(after.data).equals(replacement)) throw new Error("Heading verification failed");
  } else if (before.type !== after.type || !Buffer.from(before.data).equals(after.data))
    throw new Error("Unrelated tag changed");
}
// All embedded font tags were checked byte-for-byte above; report those resources.
const fontResources = tags.filter(t => t.type === 75 && (t.data[2]! & 0x80) !== 0)
  .map(t => ({ name: parseDefineFont3Tag(t.data).name, verified: true, unchanged: true }));
if (fontResources.length === 0) throw new Error("No verified embedded fonts");
const files = await writeVerifiedPack(gameRoot, out, header, [{ identifier, bytes: next }]);
await writeFile(path.join(out, "install-manifest.json"), JSON.stringify({ gameRoot, files,
  fontResourcesVerified: true, fontResources }, null, 2));
await writeFile(path.join(out, "report.json"), JSON.stringify({ fit, fillRule: "nonzero",
  changedAsset: identifier, changedCharacter: 119, otherTagsUnchanged: true, inGameVerified: false }, null, 2));
console.log(`Staged heading-only correction: ${out}`);
