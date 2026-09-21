import { access } from "node:fs/promises";
import path from "node:path";
import { parseBuddhaTextResource, stringField } from "../../resources/buddha-text/parse.ts";
import { extractBuddhaEntry } from "../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { payloadPathFromHeader } from "../../archive/companion-path.ts";
import {
  BRUTAL_LEGEND_FRONTEND_GFX_ENTRY,
  BRUTAL_LEGEND_FRONTEND_MOVIE_ENTRY,
  BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_GFX_PACK,
  BRUTAL_LEGEND_LOOSE_FONTS,
  BRUTAL_LEGEND_LOOSE_FRONTEND,
  BRUTAL_LEGEND_RELEASE_CONFIG,
  BRUTAL_LEGEND_STRING_TABLE_ENTRY,
  BRUTAL_LEGEND_STRING_TABLE_PACK,
} from "../games/brutal-legend/config.ts";

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export type BrutalLegendAssetState = {
  readonly gameRoot: string;
  readonly usePackfiles: boolean | undefined;
  readonly looseFrontendPresent: boolean;
  readonly looseFontsPresent: boolean;
  readonly frontendFlashFile: string | undefined;
  readonly stringTableHeader: string;
  readonly stringTablePayload: string;
  readonly gfxHeader: string;
  readonly gfxPayload: string;
  readonly frontendBytes: Uint8Array;
  readonly fontsBytes: Uint8Array;
  readonly stringTableBytes: Uint8Array;
};

function parseUsePackfiles(text: string): boolean | undefined {
  const match = /UsePackfiles\s*=\s*(true|false)/i.exec(text);
  if (match === null) {
    return undefined;
  }
  return match[1]?.toLowerCase() === "true";
}

export async function loadBrutalLegendAssets(gameRoot: string): Promise<BrutalLegendAssetState> {
  const configPath = path.join(gameRoot, BRUTAL_LEGEND_RELEASE_CONFIG);
  let usePackfiles: boolean | undefined;
  if (await exists(configPath)) {
    usePackfiles = parseUsePackfiles(await Bun.file(configPath).text());
  }
  const stringTableHeader = path.join(gameRoot, BRUTAL_LEGEND_STRING_TABLE_PACK);
  const gfxHeader = path.join(gameRoot, BRUTAL_LEGEND_GFX_PACK);
  const gfxList = await openBuddhaPack({
    headerPath: gfxHeader,
    payloadPath: payloadPathFromHeader(gfxHeader),
  });
  const frontend = await extractBuddhaEntry(gfxList, BRUTAL_LEGEND_FRONTEND_GFX_ENTRY);
  const fonts = await extractBuddhaEntry(gfxList, BRUTAL_LEGEND_FONTS_GFX_ENTRY);
  let frontendFlashFile: string | undefined;
  try {
    const movie = await extractBuddhaEntry(gfxList, BRUTAL_LEGEND_FRONTEND_MOVIE_ENTRY);
    const parsed = parseBuddhaTextResource(movie.bytes);
    frontendFlashFile = stringField(parsed.fields, "FlashFile");
  } catch {
    frontendFlashFile = undefined;
  }
  const tableList = await openBuddhaPack({
    headerPath: stringTableHeader,
    payloadPath: payloadPathFromHeader(stringTableHeader),
  });
  const table = await extractBuddhaEntry(tableList, BRUTAL_LEGEND_STRING_TABLE_ENTRY);
  return {
    gameRoot,
    usePackfiles,
    looseFrontendPresent: await exists(path.join(gameRoot, BRUTAL_LEGEND_LOOSE_FRONTEND)),
    looseFontsPresent: await exists(path.join(gameRoot, BRUTAL_LEGEND_LOOSE_FONTS)),
    frontendFlashFile,
    stringTableHeader,
    stringTablePayload: payloadPathFromHeader(stringTableHeader),
    gfxHeader,
    gfxPayload: payloadPathFromHeader(gfxHeader),
    frontendBytes: frontend.bytes,
    fontsBytes: fonts.bytes,
    stringTableBytes: table.bytes,
  };
}
