import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeStringTable } from "../../../resources/stringtable/decode.ts";
import { extractBuddhaEntry } from "../../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../../archive/buddha/open.ts";
import { payloadPathFromHeader } from "../../../archive/companion-path.ts";
import { Shaper } from "../../../rendering/font/shaper.ts";
import { resolveBrutalLegendRoot } from "../root.ts";
import { PatchError } from "../../../patch/errors.ts";
import {
  BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_FRONTEND_GFX_ENTRY,
  BRUTAL_LEGEND_GFX_PACK,
  BRUTAL_LEGEND_STRING_TABLE_ENTRY,
  BRUTAL_LEGEND_STRING_TABLE_PACK,
} from "../config.ts";
import {
  BRUTAL_LEGEND_TITLE_FRAME_LABELS,
  BRUTAL_LEGEND_V2_FIELD_IDS,
  BRUTAL_LEGEND_V2_MENU_FIELDS,
  BRUTAL_LEGEND_EDIT_TEXT_ALIGNMENTS,
} from "../menu/fields.ts";
import { parseDefineEditText } from "../../../patch/gfx/edit-text.ts";
import { inspectGfxBytes } from "../../../patch/gfx/inspect.ts";
import { parseDefineFont3Tag } from "../../../patch/gfx/font3/parse.ts";
import { decompressGfx, readU16Le, walkSwfTags } from "../../../patch/gfx/swf.ts";
import { sha256Bytes, sha256File } from "../../../patch/hash.ts";
import { verifyMainMenuIds } from "../menu/verify.ts";
import { replaceStringTableTexts } from "../../../patch/stringtable/replace.ts";
import type { LoadedTranslations } from "../../../patch/translations/load.ts";
import { encodedReplacements, rewriteMenuFonts } from "../menu/rewrite-fonts.ts";
import { loadBrutalLegendAssets } from "../assets/load.ts";
import { assertStagedPackEntries, stagePackReplacements } from "../../../patch/stage/pack-write.ts";

export const FORCE_FONT_PATH = "assets/fonts/force.ttf";

export type StageOptions = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly gameRoot?: string;
  readonly outDir: string;
  readonly workspaceRoot: string;
  readonly fontPath?: string;
  readonly translationInputs: LoadedTranslations;
};

function assertOriginalGlyphsPreserved(originalBytes: Uint8Array, nextBytes: Uint8Array, puaCodes: readonly number[]): void {
  const originalTags = walkSwfTags(decompressGfx(originalBytes).body).tags.filter((tag) => tag.type === 75);
  const nextTags = walkSwfTags(decompressGfx(nextBytes).body).tags.filter((tag) => tag.type === 75);
  if (originalTags.length !== nextTags.length) {
    throw new PatchError("ROUNDTRIP", "Font rewrite changed DefineFont3 tag count");
  }
  for (let index = 0; index < originalTags.length; index += 1) {
    const originalTag = originalTags[index];
    const nextTag = nextTags[index];
    if (originalTag === undefined || nextTag === undefined) {
      continue;
    }
    const original = parseDefineFont3Tag(originalTag.data);
    const next = parseDefineFont3Tag(nextTag.data);
    if (original.name !== next.name || original.id !== next.id) {
      throw new PatchError("ROUNDTRIP", "Font rewrite changed font identity");
    }
    if (next.glyphs.length < original.glyphs.length) {
      throw new PatchError("ROUNDTRIP", `DefineFont3 ${original.name} lost glyphs`);
    }
    for (let glyphIndex = 0; glyphIndex < original.glyphs.length; glyphIndex += 1) {
      const before = original.glyphs[glyphIndex];
      const after = next.glyphs[glyphIndex];
      if (before === undefined || after === undefined) {
        throw new PatchError("ROUNDTRIP", `DefineFont3 ${original.name} glyph ${glyphIndex} missing after rewrite`);
      }
      if (
        before.code !== after.code ||
        before.advance !== after.advance ||
        before.shapeBytes.length !== after.shapeBytes.length ||
        before.shapeBytes.some((value, byteIndex) => value !== after.shapeBytes[byteIndex])
      ) {
        throw new PatchError("ROUNDTRIP", `DefineFont3 ${original.name} original glyph ${glyphIndex} changed`);
      }
    }
    if (next.glyphs.length === original.glyphs.length) {
      continue;
    }
    for (const code of puaCodes) {
      const glyph = next.glyphs.find((item) => item.code === code);
      if (glyph === undefined) {
        throw new PatchError("ROUNDTRIP", `DefineFont3 ${original.name} is missing appended PUA U+${code.toString(16)}`);
      }
    }
  }
}

export async function stageBrutalLegendMainMenu(options: StageOptions): Promise<{ readonly outDir: string }> {
  const outDir = path.resolve(options.outDir);
  if (await Bun.file(path.join(outDir, "report.json")).exists()) {
    throw new PatchError("SAFETY", `Refusing to overwrite existing experiment ${outDir}`);
  }
  const gameRoot = path.resolve(resolveBrutalLegendRoot(options.env, options.gameRoot));
  const assets = await loadBrutalLegendAssets(gameRoot);
  const frontend = inspectGfxBytes(assets.frontendBytes);
  const fonts = inspectGfxBytes(assets.fontsBytes);
  const table = decodeStringTable(assets.stringTableBytes);
  const englishById = new Map(table.records.map((record) => [record.lineCode, record.text]));

  const translations = options.translationInputs.translations;
  const arabicById = new Map([...translations.entries()].map(([id, row]) => [id, row.text]));

  const verification = verifyMainMenuIds({
    frontend,
    englishById,
    arabicById,
    frontendFlashFile: assets.frontendFlashFile,
    usePackfiles: assets.usePackfiles,
    looseFrontendPresent: assets.looseFrontendPresent,
    looseFontsPresent: assets.looseFontsPresent,
  });

  const selected = BRUTAL_LEGEND_V2_MENU_FIELDS.map((field) => {
    const decision = verification.decisions.find((item) => item.lineCode === field.lineCode);
    if (decision === undefined || decision.status !== "verified" || decision.arabic === undefined) {
      throw new PatchError("MENU", `Selected field ${field.lineCode} is not a verified translated FrontEnd *LINECODE`);
    }
    return { id: field.lineCode, text: decision.arabic, field, english: decision.english };
  });

  const fontPath = options.fontPath ?? path.join(options.workspaceRoot, FORCE_FONT_PATH);
  const shaper = Shaper.open(fontPath, { expectedFamily: "Force" });
  let fontRewrite;
  try {
    fontRewrite = rewriteMenuFonts({
      fontsBytes: assets.fontsBytes,
      frontendBytes: assets.frontendBytes,
      shaper,
      labels: selected.map((item) => ({ id: item.id, text: item.text })),
      editTextAlignments: BRUTAL_LEGEND_EDIT_TEXT_ALIGNMENTS,
    });
  } finally {
    shaper.destroy();
  }
  const puaCodes = fontRewrite.plan.glyphs.map((glyph) => glyph.code);
  assertOriginalGlyphsPreserved(assets.fontsBytes, fontRewrite.fontsBytes, puaCodes);
  assertOriginalGlyphsPreserved(assets.frontendBytes, fontRewrite.frontendBytes, puaCodes);

  for (const alignment of BRUTAL_LEGEND_EDIT_TEXT_ALIGNMENTS) {
    const patchedTag = walkSwfTags(decompressGfx(fontRewrite.frontendBytes).body).tags.find(
      (tag) => tag.type === 37 && readU16Le(tag.data, 0) === alignment.id,
    );
    if (patchedTag === undefined) {
      throw new PatchError("ROUNDTRIP", `DefineEditText ${alignment.id} missing after rewrite`);
    }
    const parsed = parseDefineEditText(patchedTag.data);
    if (parsed.align !== alignment.align) {
      throw new PatchError(
        "ROUNDTRIP",
        `DefineEditText ${alignment.id} alignment is ${parsed.align}, expected ${alignment.align}`,
      );
    }
  }

  const puaReplacements = encodedReplacements(fontRewrite.plan);
  const rewritten = replaceStringTableTexts(assets.stringTableBytes, puaReplacements);

  const stringPack = await stagePackReplacements({
    headerPath: assets.stringTableHeader,
    payloadPath: assets.stringTablePayload,
    replacements: [{ identifier: BRUTAL_LEGEND_STRING_TABLE_ENTRY, bytes: rewritten.bytes }],
  });
  const gfxPack = await stagePackReplacements({
    headerPath: assets.gfxHeader,
    payloadPath: assets.gfxPayload,
    replacements: [
      { identifier: BRUTAL_LEGEND_FONTS_GFX_ENTRY, bytes: fontRewrite.fontsBytes },
      { identifier: BRUTAL_LEGEND_FRONTEND_GFX_ENTRY, bytes: fontRewrite.frontendBytes },
    ],
  });

  const packsDir = path.join(outDir, "packs");
  await mkdir(packsDir, { recursive: true });
  const stagedStringHeader = path.join(packsDir, "RgS_Faction.~h");
  const stagedStringPayload = path.join(packsDir, "RgS_Faction.~p");
  const stagedGfxHeader = path.join(packsDir, "Man_Gfx.~h");
  const stagedGfxPayload = path.join(packsDir, "Man_Gfx.~p");
  await writeFile(stagedStringHeader, stringPack.result.header);
  await writeFile(stagedStringPayload, stringPack.result.payload);
  await writeFile(stagedGfxHeader, gfxPack.result.header);
  await writeFile(stagedGfxPayload, gfxPack.result.payload);

  await assertStagedPackEntries({
    headerPath: stagedStringHeader,
    payloadPath: stagedStringPayload,
    originalHeaderPath: assets.stringTableHeader,
    originalPayloadPath: assets.stringTablePayload,
    replacements: [{ identifier: BRUTAL_LEGEND_STRING_TABLE_ENTRY, bytes: rewritten.bytes }],
    rebuilt: stringPack.result,
  });
  await assertStagedPackEntries({
    headerPath: stagedGfxHeader,
    payloadPath: stagedGfxPayload,
    originalHeaderPath: assets.gfxHeader,
    originalPayloadPath: assets.gfxPayload,
    replacements: [
      { identifier: BRUTAL_LEGEND_FONTS_GFX_ENTRY, bytes: fontRewrite.fontsBytes },
      { identifier: BRUTAL_LEGEND_FRONTEND_GFX_ENTRY, bytes: fontRewrite.frontendBytes },
    ],
    rebuilt: gfxPack.result,
  });

  const stagedTable = await extractBuddhaEntry(
    await openBuddhaPack({
      headerPath: stagedStringHeader,
      payloadPath: stagedStringPayload,
    }),
    BRUTAL_LEGEND_STRING_TABLE_ENTRY,
  );
  const stagedDecoded = decodeStringTable(stagedTable.bytes);
  for (const item of rewritten.replaced) {
    const found = stagedDecoded.records.find((record) => record.lineCode === item.lineCode);
    if (found?.text !== item.text) {
      throw new PatchError("ROUNDTRIP", `Staged StringTable ${item.lineCode} did not keep the PUA replacement`);
    }
  }

  const stagedFontsInspect = inspectGfxBytes(fontRewrite.fontsBytes);
  const stagedFrontendInspect = inspectGfxBytes(fontRewrite.frontendBytes);
  if (!stagedFontsInspect.fonts.every((font) => font.hasArabicOrPua) || !stagedFrontendInspect.fonts.some((font) => font.name === "Zamora" && font.hasArabicOrPua)) {
    throw new PatchError("ROUNDTRIP", "Staged fonts do not expose the appended BMP PUA codes");
  }

  const previewDir = path.join(outDir, "previews");
  await mkdir(previewDir, { recursive: true });
  for (const [name, svg] of Object.entries(fontRewrite.previewSvgByFont)) {
    await writeFile(path.join(previewDir, `${name}.svg`), svg);
  }

  const fontResources = fontRewrite.rewrittenFonts.map((font) => ({
    file: font.file,
    name: font.name,
    id: font.id,
    originalGlyphCount: font.originalGlyphCount,
    nextGlyphCount: font.nextGlyphCount,
    appendedCodes: font.appendedCodes,
    wideOffsets: font.wideOffsets,
    originalTagLength: font.originalTagLength,
    nextTagLength: font.nextTagLength,
    verified: true,
  }));

  const report = {
    game: "brutal-legend",
    scope: "main-menu-only",
    translationProvenance: options.translationInputs.provenance,
    experiment: "v3-main-menu-arabic",
    installedGameModified: false,
    readyToApply: true,
    gameRoot,
    usePackfiles: assets.usePackfiles,
    looseFrontendPresent: assets.looseFrontendPresent,
    looseFontsPresent: assets.looseFontsPresent,
    frontendFlashFile: assets.frontendFlashFile,
    menuAssetPrecedence:
      assets.usePackfiles === true
        ? "UsePackfiles=true, so Man_Gfx pack entries win over loose Data/UI files. FrontEnd.gfx and EnglishFonts.gfx also exist loose and currently match the packed bytes. Loader precedence was not re-tested here."
        : "Release config does not set UsePackfiles=true; loose Data/UI files would load if present. Loader precedence was not re-tested here.",
    inGameVerified: false,
    titleItems:
      "New Game, Continue, Options, and Extras are FrontEnd.gfx frame labels. They are not *LINECODE string-table fields. This stage does not claim those title tiles change.",
    selectedFields: selected.map((item) => ({
      lineCode: item.id,
      role: item.field.role,
      english: item.english,
      arabicLogical: item.text,
      encodedPua: fontRewrite.plan.labels.find((label) => label.id === item.id)?.encoded,
      units: fontRewrite.plan.labels.find((label) => label.id === item.id)?.units,
      font: item.field.font,
      evidence: item.field.evidence,
    })),
    skippedVerifiedIds: verification.verifiedIds.filter((id) => !BRUTAL_LEGEND_V2_FIELD_IDS.includes(id)),
    titleFrameLabels: fontRewrite.titleFrameLabels,
    knownTitleFrameLabels: BRUTAL_LEGEND_TITLE_FRAME_LABELS,
    editTextEvidence: fontRewrite.editTextEvidence,
    patchedEditTexts: fontRewrite.patchedEditTexts,
    frontend: {
      signature: frontend.signature,
      version: frontend.version,
      frameCount: frontend.frameCount,
      leftover: frontend.leftover,
      tagCounts: frontend.tagCounts,
      fonts: frontend.fonts,
      starredLineCodes: frontend.starredLineCodes,
    },
    fonts,
    stagedFonts: stagedFontsInspect.fonts,
    stagedFrontendFonts: stagedFrontendInspect.fonts,
    fontResources,
    fontScale: fontRewrite.plan.scale,
    maxQuadError: fontRewrite.plan.maxQuadError,
    verification,
    replacements: rewritten.replaced,
    packs: {
      stringTable: {
        header: stagedStringHeader,
        payload: stagedStringPayload,
        alignment: stringPack.result.alignment,
        originalHeaderSha256: stringPack.result.originalHeaderSha256,
        originalPayloadSha256: stringPack.result.originalPayloadSha256,
        stagedHeaderSha256: sha256Bytes(stringPack.result.header),
        stagedPayloadSha256: sha256Bytes(stringPack.result.payload),
        entries: stringPack.replacements,
      },
      gfx: {
        header: stagedGfxHeader,
        payload: stagedGfxPayload,
        alignment: gfxPack.result.alignment,
        originalHeaderSha256: gfxPack.result.originalHeaderSha256,
        originalPayloadSha256: gfxPack.result.originalPayloadSha256,
        stagedHeaderSha256: sha256Bytes(gfxPack.result.header),
        stagedPayloadSha256: sha256Bytes(gfxPack.result.payload),
        entries: gfxPack.replacements,
      },
    },
    apply: {
      command:
        "bun --no-env-file run start patch apply --stage " +
        outDir +
        " --backup out/backups/brutal-legend-main-menu --confirm",
      neverRan: true,
      requiresExplicitConfirm: true,
      refusesIfGameRunning: true,
      refusesFontIncomplete: true,
    },
  };

  const installFiles = [
    {
      relativePath: BRUTAL_LEGEND_STRING_TABLE_PACK,
      stagedRelativePath: "packs/RgS_Faction.~h",
      originalSha256: stringPack.result.originalHeaderSha256,
      originalBytes: (await Bun.file(assets.stringTableHeader).arrayBuffer()).byteLength,
      stagedSha256: sha256Bytes(stringPack.result.header),
      stagedBytes: stringPack.result.header.length,
    },
    {
      relativePath: payloadPathFromHeader(BRUTAL_LEGEND_STRING_TABLE_PACK),
      stagedRelativePath: "packs/RgS_Faction.~p",
      originalSha256: stringPack.result.originalPayloadSha256,
      originalBytes: (await Bun.file(assets.stringTablePayload).arrayBuffer()).byteLength,
      stagedSha256: sha256Bytes(stringPack.result.payload),
      stagedBytes: stringPack.result.payload.length,
    },
    {
      relativePath: BRUTAL_LEGEND_GFX_PACK,
      stagedRelativePath: "packs/Man_Gfx.~h",
      originalSha256: gfxPack.result.originalHeaderSha256,
      originalBytes: (await Bun.file(assets.gfxHeader).arrayBuffer()).byteLength,
      stagedSha256: sha256Bytes(gfxPack.result.header),
      stagedBytes: gfxPack.result.header.length,
    },
    {
      relativePath: payloadPathFromHeader(BRUTAL_LEGEND_GFX_PACK),
      stagedRelativePath: "packs/Man_Gfx.~p",
      originalSha256: gfxPack.result.originalPayloadSha256,
      originalBytes: (await Bun.file(assets.gfxPayload).arrayBuffer()).byteLength,
      stagedSha256: sha256Bytes(gfxPack.result.payload),
      stagedBytes: gfxPack.result.payload.length,
    },
  ];

  await mkdir(path.join(outDir, "extracted"), { recursive: true });
  await writeFile(path.join(outDir, "extracted", "brutallegend_enus.bin"), rewritten.bytes);
  await writeFile(path.join(outDir, "extracted", "EnglishFonts.gfx"), fontRewrite.fontsBytes);
  await writeFile(path.join(outDir, "extracted", "FrontEnd.gfx"), fontRewrite.frontendBytes);
  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outDir, "replacements.json"), `${JSON.stringify(rewritten.replaced, null, 2)}\n`);
  await writeFile(
    path.join(outDir, "pua-map.json"),
    `${JSON.stringify(
      {
        scale: fontRewrite.plan.scale,
        labels: fontRewrite.plan.labels,
        glyphs: fontRewrite.plan.glyphs.map((glyph) => ({
          code: glyph.code,
          advance: glyph.advance,
          shapeBytes: glyph.shapeBytes.length,
        })),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(outDir, "install-manifest.json"),
    `${JSON.stringify(
      {
        gameRoot,
        fontResourcesVerified: true,
        fontResources,
        files: installFiles,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(outDir, "sha256.json"),
    `${JSON.stringify(
      {
        files: [
          { relativePath: "packs/RgS_Faction.~h", sha256: await sha256File(stagedStringHeader), bytes: stringPack.result.header.length },
          { relativePath: "packs/RgS_Faction.~p", sha256: await sha256File(stagedStringPayload), bytes: stringPack.result.payload.length },
          { relativePath: "packs/Man_Gfx.~h", sha256: await sha256File(stagedGfxHeader), bytes: gfxPack.result.header.length },
          { relativePath: "packs/Man_Gfx.~p", sha256: await sha256File(stagedGfxPayload), bytes: gfxPack.result.payload.length },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return { outDir };
}
