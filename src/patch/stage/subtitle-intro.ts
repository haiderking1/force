import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../archive/buddha/extract.ts";
import { payloadPathFromHeader } from "../../archive/companion-path.ts";
import { decodeVidSubtitles } from "../../resources/subtitles/decode.ts";
import { LayoutEngine } from "../../rendering/engine.ts";
import { generateSvgPreview } from "../../rendering/preview/svg.ts";
import { planPuaLines } from "../font/pua-lines.ts";
import { PatchError } from "../errors.ts";
import { appendFont3Glyphs } from "../gfx/font3/append.ts";
import { parseDefineFont3Tag } from "../gfx/font3/parse.ts";
import { serializeDefineFont3Tag } from "../gfx/font3/serialize.ts";
import { decompressGfx, walkSwfTags } from "../gfx/swf.ts";
import { rebuildGfxFile } from "../gfx/rewrite.ts";
import { sha256Bytes } from "../hash.ts";
import type { StagedInstallFile } from "../install/apply.ts";
import { replaceStringTableTexts } from "../stringtable/replace.ts";
import { mergeTranslations } from "../translations/load.ts";
import { BRUTAL_LEGEND_FONTS_GFX_ENTRY, BRUTAL_LEGEND_GFX_PACK,
  BRUTAL_LEGEND_STRING_TABLE_ENTRY, BRUTAL_LEGEND_STRING_TABLE_PACK,
  BRUTAL_LEGEND_TRANSLATION_DIRS } from "../games/brutal-legend/config.ts";
import { introDisplayText, introSubtitleProfile, SUBTITLE_ASSET, SUBTITLE_FONT,
  SUBTITLE_TIMING_PACK, INTRO_SUBTITLE_ENTRY } from "../games/brutal-legend/subtitle-profile.ts";
import { assertStagedPackEntries, stagePackReplacements } from "./pack-write.ts";

export async function stageSubtitleIntro(gameRoot: string, output: string) {
  const out = path.resolve(output);
  // mkdir without recursive refuses existing stages rather than mixing artifacts.
  await mkdir(path.dirname(out), { recursive: true });
  await mkdir(out);
  const open = (relative: string) => openBuddhaPack({ headerPath: path.join(gameRoot, relative),
    payloadPath: path.join(gameRoot, payloadPathFromHeader(relative)) });
  const gfx = await open(BRUTAL_LEGEND_GFX_PACK);
  const fonts = (await extractBuddhaEntry(gfx, BRUTAL_LEGEND_FONTS_GFX_ENTRY)).bytes;
  const subtitle = (await extractBuddhaEntry(gfx, SUBTITLE_ASSET)).bytes;
  const timing = (await extractBuddhaEntry(await open(SUBTITLE_TIMING_PACK), INTRO_SUBTITLE_ENTRY)).bytes;
  const records = decodeVidSubtitles(timing).records;
  const translations = mergeTranslations(await Promise.all(BRUTAL_LEGEND_TRANSLATION_DIRS.map(
    async (file) => ({ path: file, raw: await Bun.file(file).json() }),
  )));
  const requests = [...new Set(records.map((record) => record.lineCode))].map((id) => {
    const translation = translations.get(id);
    if (!translation) throw new PatchError("TRANSLATION", `Missing subtitle ${id}`);
    return { id, text: introDisplayText(translation.text) };
  });
  const tags = walkSwfTags(decompressGfx(fonts).body).tags;
  const matching = tags.filter((tag) => tag.type === 75 && parseDefineFont3Tag(tag.data).name === SUBTITLE_FONT);
  const tag = matching[0];
  if (!tag || matching.length !== 1) throw new PatchError("GFX", "Expected one TG_Condensed font");
  const original = parseDefineFont3Tag(tag.data);
  const firstCode = Math.max(0xe000, ...original.glyphs.map((glyph) => glyph.code + 1));
  const profile = introSubtitleProfile(subtitle);
  const { engine, shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
  let plan;
  try {
    plan = planPuaLines(engine, requests, profile, firstCode);
    await mkdir(path.join(out, "previews"));
    for (const label of plan.labels) {
      await writeFile(path.join(out, "previews", `${label.id}.svg`), generateSvgPreview(
        label.layout, shaper, { backgroundColor: "#151515", textColor: "#ffffff" }));
    }
  } finally {
    shaper.destroy();
  }
  const nextFont = serializeDefineFont3Tag(appendFont3Glyphs(original, plan.glyphs));
  const verified = parseDefineFont3Tag(nextFont);
  for (const [index, glyph] of original.glyphs.entries()) {
    const next = verified.glyphs[index];
    if (!next || glyph.code !== next.code || glyph.advance !== next.advance ||
        sha256Bytes(glyph.shapeBytes) !== sha256Bytes(next.shapeBytes) ||
        sha256Bytes(glyph.boundsBytes) !== sha256Bytes(next.boundsBytes)) {
      throw new PatchError("ROUNDTRIP", "Subtitle font changed an existing menu/Latin glyph");
    }
  }
  for (const glyph of plan.glyphs) {
    const next = verified.glyphs.find((item) => item.code === glyph.code);
    if (!next || next.advance !== glyph.advance || sha256Bytes(next.shapeBytes) !== sha256Bytes(glyph.shapeBytes)) {
      throw new PatchError("ROUNDTRIP", "Subtitle glyph failed font round trip");
    }
  }
  const nextFonts = rebuildGfxFile(fonts, new Map([[tag.offset, nextFont]]));
  const table = (await extractBuddhaEntry(await open(BRUTAL_LEGEND_STRING_TABLE_PACK),
    BRUTAL_LEGEND_STRING_TABLE_ENTRY)).bytes;
  const nextTable = replaceStringTableTexts(table, plan.labels.map((label) => ({
    lineCode: label.id, text: label.encoded,
  })));
  const files: StagedInstallFile[] = [];
  await mkdir(path.join(out, "packs"));
  for (const job of [
    { header: BRUTAL_LEGEND_STRING_TABLE_PACK, identifier: BRUTAL_LEGEND_STRING_TABLE_ENTRY, bytes: nextTable.bytes },
    { header: BRUTAL_LEGEND_GFX_PACK, identifier: BRUTAL_LEGEND_FONTS_GFX_ENTRY, bytes: nextFonts },
  ]) {
    const headerPath = path.join(gameRoot, job.header);
    const payloadPath = payloadPathFromHeader(headerPath);
    const replacements = [{ identifier: job.identifier, bytes: job.bytes }];
    const rebuilt = await stagePackReplacements({ headerPath, payloadPath, replacements });
    const stagedHeader = path.join(out, "packs", path.basename(headerPath));
    const stagedPayload = payloadPathFromHeader(stagedHeader);
    await writeFile(stagedHeader, rebuilt.result.header);
    await writeFile(stagedPayload, rebuilt.result.payload);
    await assertStagedPackEntries({ headerPath: stagedHeader, payloadPath: stagedPayload,
      originalHeaderPath: headerPath, originalPayloadPath: payloadPath, replacements, rebuilt: rebuilt.result });
    for (const item of [
      { relative: job.header, staged: stagedHeader, bytes: rebuilt.result.header, before: rebuilt.result.originalHeaderSha256 },
      { relative: payloadPathFromHeader(job.header), staged: stagedPayload, bytes: rebuilt.result.payload, before: rebuilt.result.originalPayloadSha256 },
    ]) {
      files.push({ relativePath: item.relative, stagedPath: item.staged, originalSha256: item.before,
        originalBytes: Bun.file(path.join(gameRoot, item.relative)).size,
        stagedSha256: sha256Bytes(item.bytes), stagedBytes: item.bytes.length });
    }
  }
  const fontResources = [{ name: SUBTITLE_FONT, verified: true, firstCode, addedGlyphs: plan.glyphs.length }];
  const manifest = { gameRoot: path.resolve(gameRoot), fontResourcesVerified: true, fontResources,
    files: files.map((file) => ({ ...file, stagedRelativePath: path.relative(out, file.stagedPath) })) };
  await writeFile(path.join(out, "install-manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(out, "report.json"), JSON.stringify({ scope: "intr1-only", inGameVerified: false,
    profile, timingEntry: INTRO_SUBTITLE_ENTRY, timingSha256: sha256Bytes(timing), timingUnchanged: true,
    subtitleGfxUnchanged: true, artworkUntouched: true, fontResources,
    cues: records, labels: plan.labels.map(({ layout, ...label }) => ({ ...label,
      lineCount: layout.lines.length, height: layout.totalHeight, fontSize: layout.fontSize })),
  }, null, 2));
  console.log(`Staged ${plan.labels.length} opening subtitles; ${plan.glyphs.length} new glyphs. ${out}`);
  return { files, manifest };
}
