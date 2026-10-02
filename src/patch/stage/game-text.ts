import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractBuddhaEntry } from "../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { payloadPathFromHeader } from "../../archive/companion-path.ts";
import { LayoutEngine } from "../../rendering/engine.ts";
import { generateSvgPreview } from "../../rendering/preview/svg.ts";
import { decodeStringTable } from "../../resources/stringtable/decode.ts";
import { FORCE_CHAR_FALLBACKS } from "../font/force-substitutions.ts";
import { containsPrivateUse } from "../font/display-text.ts";
import { GameTextPlanner, type EncodedGameLabel, type GameTextProfile } from "../font/pua-game-text.ts";
import { PatchError } from "../errors.ts";
import { sha256Bytes, sha256File } from "../hash.ts";
import type { StagedInstallFile } from "../install/apply.ts";
import { replaceStringTableTexts } from "../stringtable/replace.ts";
import { mergeTranslations } from "../translations/load.ts";
import {
  BRUTAL_LEGEND_DLC_PACK,
  BRUTAL_LEGEND_DLC_STRING_TABLE_ENTRY,
  BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_FRONTEND_GFX_ENTRY,
  BRUTAL_LEGEND_GFX_PACK,
  BRUTAL_LEGEND_STRING_TABLE_ENTRY,
  BRUTAL_LEGEND_STRING_TABLE_PACK,
  BRUTAL_LEGEND_TRANSLATION_DIRS,
} from "../games/brutal-legend/config.ts";
import { lowerSubtitleSprite } from "../games/brutal-legend/subtitle-placement.ts";
import {
  GENERAL_TEXT_PROFILE,
  OVERFLOW_TEXT_PROFILE,
  OVERFLOW_UI_PROFILE,
  SUBTITLE_ASSET,
  SUBTITLE_FONT,
  SUBTITLE_FONT_FAMILIES,
  SUBTITLE_TIMING_PACK,
  SUBTITLE_WRAP_PROFILE,
} from "../games/brutal-legend/subtitle-profile.ts";
import { appendGlyphsToNamedFonts, nextPuaCode } from "./append-fonts.ts";
import { collectTimedCues, uniqueCueIds } from "./collect-cues.ts";
import { auditCoverage, classifyKind, spokenIds, type CoverageKind } from "./coverage.ts";
import { assertStagedPackEntries, stagePackReplacements } from "./pack-write.ts";

export type GameTextStageOptions = {
  readonly gameRoot: string;
  readonly outDir: string;
  readonly workspaceRoot: string;
};

type CompactLabel = {
  readonly id: string;
  readonly table: "main" | "dlc";
  readonly kind: CoverageKind;
  readonly encoded: string;
  readonly lineCount: number;
  readonly height: number;
  readonly fontSize: number;
  readonly widths: readonly number[];
  readonly tokens: readonly string[];
  readonly gafCount: number;
  readonly boxFit: boolean;
};

function openPack(gameRoot: string, relative: string) {
  return openBuddhaPack({
    headerPath: path.join(gameRoot, relative),
    payloadPath: path.join(gameRoot, payloadPathFromHeader(relative)),
  });
}

function assertTokensPreserved(label: EncodedGameLabel): void {
  for (const token of label.tokens) {
    if (!label.encoded.includes(token)) {
      throw new PatchError("ROUNDTRIP", `${label.id} dropped operative token ${token}`);
    }
    for (const char of token) {
      const code = char.codePointAt(0);
      if (code === undefined || code > 0x7f) {
        throw new PatchError("ROUNDTRIP", `${label.id} token ${token} is not ASCII`);
      }
    }
  }
  for (const fallback of FORCE_CHAR_FALLBACKS) {
    if (label.logical.includes(fallback.from) || label.encoded.includes(fallback.from)) {
      throw new PatchError(
        "VALIDATION",
        `${label.id} still contains ${fallback.from} after the ${fallback.key} fallback`,
      );
    }
  }
}

function profileFor(kind: CoverageKind): { readonly profile: GameTextProfile; readonly fallback: GameTextProfile } {
  if (kind === "ui") {
    return { profile: GENERAL_TEXT_PROFILE, fallback: OVERFLOW_UI_PROFILE };
  }
  return { profile: SUBTITLE_WRAP_PROFILE, fallback: OVERFLOW_TEXT_PROFILE };
}

async function writeStagedPack(options: {
  readonly gameRoot: string;
  readonly outDir: string;
  readonly header: string;
  readonly replacements: readonly { readonly identifier: string; readonly bytes: Uint8Array }[];
  readonly files: StagedInstallFile[];
}): Promise<void> {
  const headerPath = path.join(options.gameRoot, options.header);
  const payloadPath = payloadPathFromHeader(headerPath);
  const rebuilt = await stagePackReplacements({
    headerPath,
    payloadPath,
    replacements: options.replacements,
  });
  const stagedHeader = path.join(options.outDir, "packs", path.basename(headerPath));
  const stagedPayload = payloadPathFromHeader(stagedHeader);
  await writeFile(stagedHeader, rebuilt.result.header);
  await writeFile(stagedPayload, rebuilt.result.payload);
  await assertStagedPackEntries({
    headerPath: stagedHeader,
    payloadPath: stagedPayload,
    originalHeaderPath: headerPath,
    originalPayloadPath: payloadPath,
    replacements: options.replacements,
    rebuilt: rebuilt.result,
  });
  for (const item of [
    {
      relative: options.header,
      staged: stagedHeader,
      bytes: rebuilt.result.header,
      before: rebuilt.result.originalHeaderSha256,
    },
    {
      relative: payloadPathFromHeader(options.header),
      staged: stagedPayload,
      bytes: rebuilt.result.payload,
      before: rebuilt.result.originalPayloadSha256,
    },
  ]) {
    options.files.push({
      relativePath: item.relative,
      stagedPath: item.staged,
      originalSha256: item.before,
      originalBytes: Bun.file(path.join(options.gameRoot, item.relative)).size,
      stagedSha256: sha256Bytes(item.bytes),
      stagedBytes: item.bytes.length,
    });
  }
}

export async function stageBrutalLegendGameText(options: GameTextStageOptions): Promise<{ readonly outDir: string }> {
  const out = path.resolve(options.outDir);
  await mkdir(path.dirname(out), { recursive: true });
  await mkdir(out);
  const gameRoot = path.resolve(options.gameRoot);

  const translations = mergeTranslations(
    await Promise.all(
      BRUTAL_LEGEND_TRANSLATION_DIRS.map(async (file) => {
        const resolved = path.join(options.workspaceRoot, file);
        return { path: resolved, raw: await Bun.file(resolved).json() };
      }),
    ),
  );
  const translationTexts = new Map([...translations.entries()].map(([id, row]) => [id, row.text]));

  const timingPack = await openPack(gameRoot, SUBTITLE_TIMING_PACK);
  const cues = await collectTimedCues(timingPack);
  const timedIds = uniqueCueIds(cues);
  const timedSet = new Set(timedIds);
  const timingHashes = [];
  for (const file of [...new Set(cues.map((cue) => cue.file))].sort()) {
    const extracted = await extractBuddhaEntry(timingPack, file);
    timingHashes.push({ entry: file, sha256: sha256Bytes(extracted.bytes), bytes: extracted.bytes.length });
  }

  const gfxPack = await openPack(gameRoot, BRUTAL_LEGEND_GFX_PACK);
  const fontsBytes = (await extractBuddhaEntry(gfxPack, BRUTAL_LEGEND_FONTS_GFX_ENTRY)).bytes;
  const subtitleBytes = (await extractBuddhaEntry(gfxPack, SUBTITLE_ASSET)).bytes;
  const frontendBytes = (await extractBuddhaEntry(gfxPack, BRUTAL_LEGEND_FRONTEND_GFX_ENTRY)).bytes;
  const frontendSha = sha256Bytes(frontendBytes);

  const mainBytes = (await extractBuddhaEntry(
    await openPack(gameRoot, BRUTAL_LEGEND_STRING_TABLE_PACK),
    BRUTAL_LEGEND_STRING_TABLE_ENTRY,
  )).bytes;
  const dlcBytes = (await extractBuddhaEntry(
    await openPack(gameRoot, BRUTAL_LEGEND_DLC_PACK),
    BRUTAL_LEGEND_DLC_STRING_TABLE_ENTRY,
  )).bytes;
  const mainTable = decodeStringTable(mainBytes);
  const dlcTable = decodeStringTable(dlcBytes);
  const spoken = new Set([...spokenIds(mainTable), ...spokenIds(dlcTable)]);

  const firstCode = nextPuaCode(fontsBytes, SUBTITLE_FONT);
  const { engine, shaper } = LayoutEngine.fromFont(path.join(options.workspaceRoot, "assets/fonts/force.ttf"), {
    expectedFamily: "Force",
  });
  const planner = new GameTextPlanner(engine, firstCode);
  const encodedByTable: { main: CompactLabel[]; dlc: CompactLabel[] } = { main: [], dlc: [] };
  const samples: CompactLabel[] = [];
  const previewIds = new Set<string>();
  const overflowIds: string[] = [];
  const tokenIds: string[] = [];

  const tables = [
    { name: "main" as const, table: mainTable },
    { name: "dlc" as const, table: dlcTable },
  ];

  try {
    await mkdir(path.join(out, "previews"), { recursive: true });
    for (const { name, table } of tables) {
      for (const record of table.records) {
        const translation = translations.get(record.lineCode);
        if (translation === undefined || translation.text.length === 0) {
          continue;
        }
        if (containsPrivateUse(record.text) || containsPrivateUse(translation.text)) {
          continue;
        }
        const kind = classifyKind(record.lineCode, timedSet, spoken);
        const chosen = profileFor(kind);
        let encoded: EncodedGameLabel;
        try {
          encoded = planner.encode(
            { id: record.lineCode, text: translation.text, profile: chosen.profile },
            chosen.fallback,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "encode failed";
          throw new PatchError("RENDER", `${record.lineCode}: ${message}`);
        }
        assertTokensPreserved(encoded);
        const compact: CompactLabel = {
          id: encoded.id,
          table: name,
          kind,
          encoded: encoded.encoded,
          lineCount: encoded.layout.lines.length,
          height: encoded.layout.totalHeight,
          fontSize: encoded.layout.fontSize,
          widths: encoded.widths,
          tokens: encoded.tokens,
          gafCount: encoded.gafCount,
          boxFit: encoded.boxFit,
        };
        encodedByTable[name].push(compact);
        if (!encoded.boxFit) {
          overflowIds.push(encoded.id);
        }
        if (encoded.tokens.length > 0) {
          tokenIds.push(encoded.id);
        }
        const wantPreview = kind === "timed" || encoded.tokens.length > 0 || encoded.gafCount > 0;
        if (wantPreview) {
          samples.push(compact);
          if (!previewIds.has(encoded.id)) {
            previewIds.add(encoded.id);
            await writeFile(
              path.join(out, "previews", `${encoded.id}.svg`),
              generateSvgPreview(encoded.layout, shaper, { backgroundColor: "#151515", textColor: "#ffffff" }),
            );
          }
        }
        if ((encodedByTable.main.length + encodedByTable.dlc.length) % 2000 === 0) {
          console.log(`encoded ${encodedByTable.main.length + encodedByTable.dlc.length} strings, ${planner.glyphs.length} glyphs`);
        }
      }
    }
  } finally {
    shaper.destroy();
  }

  const encodedIds = new Set([...encodedByTable.main, ...encodedByTable.dlc].map((row) => row.id));
  const coverage = auditCoverage({
    main: mainTable,
    dlc: dlcTable,
    timedIds,
    timedCueRecords: cues.length,
    translations: translationTexts,
    encodedIds,
  });
  if (coverage.encoded !== encodedIds.size) {
    throw new PatchError("VALIDATION", `Coverage encoded ${coverage.encoded} does not match planner ${encodedIds.size}`);
  }
  for (const row of coverage.rows) {
    if (row.skipReason === undefined && !row.encoded) {
      throw new PatchError("VALIDATION", `${row.id} was eligible but not encoded`);
    }
  }

  const fonts = appendGlyphsToNamedFonts(fontsBytes, SUBTITLE_FONT_FAMILIES, planner.glyphs);
  const placement = lowerSubtitleSprite(subtitleBytes);
  const nextMain = replaceStringTableTexts(
    mainBytes,
    encodedByTable.main.map((row) => ({ lineCode: row.id, text: row.encoded })),
  );
  const nextDlc = replaceStringTableTexts(
    dlcBytes,
    encodedByTable.dlc.map((row) => ({ lineCode: row.id, text: row.encoded })),
  );

  const files: StagedInstallFile[] = [];
  await mkdir(path.join(out, "packs"), { recursive: true });
  await writeStagedPack({
    gameRoot,
    outDir: out,
    header: BRUTAL_LEGEND_STRING_TABLE_PACK,
    replacements: [{ identifier: BRUTAL_LEGEND_STRING_TABLE_ENTRY, bytes: nextMain.bytes }],
    files,
  });
  if (encodedByTable.dlc.length > 0) {
    await writeStagedPack({
      gameRoot,
      outDir: out,
      header: BRUTAL_LEGEND_DLC_PACK,
      replacements: [{ identifier: BRUTAL_LEGEND_DLC_STRING_TABLE_ENTRY, bytes: nextDlc.bytes }],
      files,
    });
  }
  await writeStagedPack({
    gameRoot,
    outDir: out,
    header: BRUTAL_LEGEND_GFX_PACK,
    replacements: [
      { identifier: BRUTAL_LEGEND_FONTS_GFX_ENTRY, bytes: fonts.next },
      { identifier: SUBTITLE_ASSET, bytes: placement.bytes },
    ],
    files,
  });

  const stagedGfx = await openBuddhaPack({
    headerPath: path.join(out, "packs", path.basename(BRUTAL_LEGEND_GFX_PACK)),
    payloadPath: payloadPathFromHeader(path.join(out, "packs", path.basename(BRUTAL_LEGEND_GFX_PACK))),
  });
  const stagedFrontend = sha256Bytes((await extractBuddhaEntry(stagedGfx, BRUTAL_LEGEND_FRONTEND_GFX_ENTRY)).bytes);
  if (stagedFrontend !== frontendSha) {
    throw new PatchError("ROUNDTRIP", "Staged Man_Gfx changed FrontEnd.gfx");
  }
  const stagedMain = decodeStringTable(
    (
      await extractBuddhaEntry(
        await openBuddhaPack({
          headerPath: path.join(out, "packs", path.basename(BRUTAL_LEGEND_STRING_TABLE_PACK)),
          payloadPath: payloadPathFromHeader(path.join(out, "packs", path.basename(BRUTAL_LEGEND_STRING_TABLE_PACK))),
        }),
        BRUTAL_LEGEND_STRING_TABLE_ENTRY,
      )
    ).bytes,
  );
  const stagedMainById = new Map(stagedMain.records.map((record) => [record.lineCode, record.text]));
  for (const row of encodedByTable.main) {
    if (stagedMainById.get(row.id) !== row.encoded) {
      throw new PatchError("ROUNDTRIP", `Staged main StringTable ${row.id} did not keep its PUA text`);
    }
  }
  for (const record of mainTable.records) {
    if (encodedIds.has(record.lineCode)) {
      continue;
    }
    if (stagedMainById.get(record.lineCode) !== record.text) {
      throw new PatchError("ROUNDTRIP", `Staged main StringTable mutated untouched ${record.lineCode}`);
    }
  }
  if (encodedByTable.dlc.length > 0) {
    const stagedDlc = decodeStringTable(
      (
        await extractBuddhaEntry(
          await openBuddhaPack({
            headerPath: path.join(out, "packs", path.basename(BRUTAL_LEGEND_DLC_PACK)),
            payloadPath: payloadPathFromHeader(path.join(out, "packs", path.basename(BRUTAL_LEGEND_DLC_PACK))),
          }),
          BRUTAL_LEGEND_DLC_STRING_TABLE_ENTRY,
        )
      ).bytes,
    );
    const stagedDlcById = new Map(stagedDlc.records.map((record) => [record.lineCode, record.text]));
    for (const row of encodedByTable.dlc) {
      if (stagedDlcById.get(row.id) !== row.encoded) {
        throw new PatchError("ROUNDTRIP", `Staged DLC StringTable ${row.id} did not keep its PUA text`);
      }
    }
  }

  const fontResources = fonts.rewritten.map((font) => ({
    name: font.name,
    verified: true,
    firstCode: font.firstCode,
    addedGlyphs: font.addedGlyphs,
  }));
  const manifest = {
    gameRoot,
    fontResourcesVerified: true,
    fontResources,
    files: files.map((file) => ({ ...file, stagedRelativePath: path.relative(out, file.stagedPath) })),
  };
  const coverageSummary = {
    timedCueRecords: coverage.timedCueRecords,
    uniqueTimedIds: coverage.uniqueTimedIds,
    spokenMain: coverage.spokenMain,
    spokenDlc: coverage.spokenDlc,
    uiMain: coverage.uiMain,
    uiDlc: coverage.uiDlc,
    translationCount: coverage.translationCount,
    alreadyEncoded: coverage.alreadyEncoded,
    encoded: coverage.encoded,
    encodedMain: encodedByTable.main.length,
    encodedDlc: encodedByTable.dlc.length,
    skippedEmpty: coverage.skippedEmpty,
    skippedUntranslated: coverage.skippedUntranslated,
    orphanTranslations: coverage.orphanTranslations,
    overflow: overflowIds.length,
    tokenBearing: tokenIds.length,
    gafSubstitutions: planner.gafSubstitutions.length,
    substitutions: planner.substitutions.length,
    firstCode,
    addedGlyphs: planner.glyphs.length,
  };
  await mkdir(path.join(out, "extracted"), { recursive: true });
  await writeFile(path.join(out, "extracted", "brutallegend_enus.bin"), nextMain.bytes);
  await writeFile(path.join(out, "extracted", "bl1dlc1_enus.bin"), nextDlc.bytes);
  await writeFile(path.join(out, "extracted", "EnglishFonts.gfx"), fonts.next);
  await writeFile(path.join(out, "extracted", "subtitle.gfx"), placement.bytes);
  await writeFile(path.join(out, "install-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(out, "coverage.json"),
    `${JSON.stringify(
      {
        ...coverageSummary,
        alreadyEncodedIds: coverage.rows.filter((row) => row.alreadyEncoded).map((row) => row.id),
        skippedUntranslatedIds: coverage.rows.filter((row) => row.skipReason === "untranslated").map((row) => row.id),
        overflowIds,
        tokenIds,
        gafSubstitutions: planner.gafSubstitutions,
        substitutions: planner.substitutions,
        rows: coverage.rows.map((row) => ({
          id: row.id,
          table: row.table,
          kind: row.kind,
          encoded: row.encoded,
          skipReason: row.skipReason,
        })),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(out, "report.json"),
    `${JSON.stringify(
      {
        game: "brutal-legend",
        scope: "full-game-text",
        installedGameModified: false,
        readyToApply: true,
        inGameVerified: false,
        artworkUntouched: true,
        moviesUntouched: true,
        timingUntouched: true,
        frontendGfxUntouched: true,
        v3MenusPreserved: true,
        introPuaPreserved: true,
        gameRoot,
        coverage: coverageSummary,
        placement: {
          beforeY: placement.beforeY,
          afterY: placement.afterY,
          deltaTwips: placement.deltaTwips,
          stageHeightPx: placement.stageHeightPx,
          lowestBottomPx: placement.lowestBottomPx,
        },
        timingHashes,
        fontResources,
        samples: samples.map((row) => ({
          id: row.id,
          table: row.table,
          kind: row.kind,
          lineCount: row.lineCount,
          height: row.height,
          fontSize: row.fontSize,
          widths: row.widths,
          tokens: row.tokens,
          gafCount: row.gafCount,
          boxFit: row.boxFit,
        })),
        apply: {
          command:
            "bun --no-env-file run start patch apply --stage " +
            out +
            " --backup out/backups/brutal-legend-game-text-v1 --confirm",
          neverRan: true,
          requiresExplicitConfirm: true,
          refusesIfGameRunning: true,
          refusesFontIncomplete: true,
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(out, "sha256.json"),
    `${JSON.stringify(
      {
        files: await Promise.all(
          files.map(async (file) => ({
            relativePath: path.relative(out, file.stagedPath),
            sha256: await sha256File(file.stagedPath),
            bytes: file.stagedBytes,
          })),
        ),
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `Staged ${coverage.encoded} strings (${coverage.uniqueTimedIds} unique timed of ${coverage.timedCueRecords} joins); ${planner.glyphs.length} new glyphs. ${out}`,
  );
  return { outDir: out };
}
