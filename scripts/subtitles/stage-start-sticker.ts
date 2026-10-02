import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { decompressGfx, walkSwfTags, readU16Le } from "../../src/patch/gfx/swf.ts";
import { parseSwfRect } from "../../src/patch/gfx/rect.ts";
import { emptyFontShapeBytes } from "../../src/patch/gfx/shape.ts";
import { rebuildGfxFile } from "../../src/patch/gfx/rewrite.ts";
import { parseDefineFont3Tag } from "../../src/patch/gfx/font3/parse.ts";
import { sha256Bytes } from "../../src/patch/hash.ts";
import { writeVerifiedPack } from "../../src/patch/stage/write-verified-pack.ts";

const [root, artwork, output] = process.argv.slice(2);
if (!root || !artwork || !output) throw new Error("Usage: stage-start-sticker.ts GAME_ROOT ARTWORK NEW_STAGE");
const gameRoot = path.resolve(root), out = path.resolve(output), project = path.resolve(artwork);
await mkdir(out); await mkdir(path.join(out, "packs")); await mkdir(path.join(out, "movies"));
const header = "Win/Packs/Man_Gfx.~h";
const pack = await openBuddhaPack({ headerPath: path.join(gameRoot, header), payloadPath: path.join(gameRoot, "Win/Packs/Man_Gfx.~p") });
const identifier = "data/ui/frontend/opt/frontend.gfx";
const original = (await extractBuddhaEntry(pack, identifier)).bytes;
const tags = walkSwfTags(decompressGfx(original).body).tags;
const overlay = tags.find(t => t.type === 83 && readU16Le(t.data, 0) === 340);
if (!overlay) throw new Error("Expected Arabic start overlay shape 340");
const first = parseSwfRect(overlay.data, 2), second = parseSwfRect(overlay.data, 2 + first.bytes.length);
const shapeOffset = 2 + first.bytes.length + second.bytes.length + 8;
const blank = new Uint8Array([...overlay.data.subarray(0, shapeOffset), ...emptyFontShapeBytes()]);
const bytes = rebuildGfxFile(original, new Map([[overlay.offset, blank]]));
const after = walkSwfTags(decompressGfx(bytes).body).tags;
if (after.length !== tags.length) throw new Error("Tag count changed");
const fontResources = [];
for (let i = 0; i < tags.length; i++) {
  const a = tags[i], b = after[i];
  if (!a || !b || a.type !== b.type || !Buffer.from(b.data).equals(a.offset === overlay.offset ? blank : a.data))
    throw new Error("Unexpected GFX tag change");
  if (a.type === 75 && ((a.data[2] ?? 0) & 0x80))
    fontResources.push({ name: parseDefineFont3Tag(a.data).name, verified: true, unchanged: true });
}
const files = await writeVerifiedPack(gameRoot, out, header, [{ identifier, bytes }]);
for (const name of ["pretitle", "title", "title-newgame"]) {
  const relativePath = `Data/UI/FrontEnd/Movies/${name}.bik`;
  const source = await Bun.file(path.join(project, "sources", name + ".bik")).bytes();
  const live = await Bun.file(path.join(gameRoot, relativePath)).bytes();
  if (sha256Bytes(source) !== sha256Bytes(live)) throw new Error(`Movie changed since snapshot: ${name}`);
  const exported = path.join(project, "exports", name, name + ".bik");
  const next = await Bun.file(exported).bytes();
  const report = await Bun.file(path.join(project, "exports", name, "verification.json")).json();
  if (!report.fullDecodePassed || !report.audioPacketsPreserved || report.sha256 !== sha256Bytes(next)
    || report.sourceSha256 !== sha256Bytes(source)) throw new Error(`Unverified export: ${name}`);
  const stagedRelativePath = `movies/${name}.bik`;
  await copyFile(exported, path.join(out, stagedRelativePath));
  files.push({ relativePath, stagedRelativePath, originalSha256: sha256Bytes(source), originalBytes: source.length,
    stagedSha256: sha256Bytes(next), stagedBytes: next.length });
}
await writeFile(path.join(out, "install-manifest.json"), JSON.stringify({ gameRoot, files,
  fontResourcesVerified: true, fontResources }, null, 2));
await writeFile(path.join(out, "report.json"), JSON.stringify({ artwork: project, frameDecisions: 113,
  removedOverlay: 340, otherGfxTagsUnchanged: true, audioPacketsPreserved: true, inGameVerified: false }, null, 2));
console.log(`Staged three movies and removed duplicate overlay: ${out}`);
