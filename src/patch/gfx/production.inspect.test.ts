import { expect, test } from "bun:test";
import path from "node:path";
import { extractBuddhaEntry } from "../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { payloadPathFromHeader } from "../../archive/companion-path.ts";
import {
  BRUTAL_LEGEND_DEFAULT_ROOT,
  BRUTAL_LEGEND_FRONTEND_GFX_ENTRY,
  BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_GFX_PACK,
} from "../games/brutal-legend/config.ts";
import { inspectGfxBytes } from "./inspect.ts";

test("production FrontEnd.gfx has starred menu line codes and Latin-only fonts", async () => {
  // This assertion describes the unmodified game, not an installed Arabic patch.
  const originalRoot = process.env.FORCE_TEST_ORIGINAL_GAME_ROOT ?? BRUTAL_LEGEND_DEFAULT_ROOT;
  const headerPath = path.join(originalRoot, BRUTAL_LEGEND_GFX_PACK);
  if (!(await Bun.file(headerPath).exists())) {
    throw new Error("Original Brütal Legend Man_Gfx pack is required; set FORCE_TEST_ORIGINAL_GAME_ROOT to an unmodified game root or backup files directory");
  }
  const list = await openBuddhaPack({ headerPath, payloadPath: payloadPathFromHeader(headerPath) });
  const frontend = inspectGfxBytes((await extractBuddhaEntry(list, BRUTAL_LEGEND_FRONTEND_GFX_ENTRY)).bytes);
  const fonts = inspectGfxBytes((await extractBuddhaEntry(list, BRUTAL_LEGEND_FONTS_GFX_ENTRY)).bytes);
  expect(frontend.starredLineCodes).toContain("PMTE028TEXT");
  expect(frontend.starredLineCodes).not.toContain("TOGU042TEXT");
  expect(frontend.lineCodes.some((hit) => hit.lineCode === "TOGU042TEXT")).toBe(false);
  expect(fonts.fonts.map((font) => font.name)).toEqual(["Schreibweise", "TG_Menu", "TG_Condensed"]);
  expect(fonts.fonts.every((font) => font.hasArabicOrPua === false)).toBe(true);
  expect(frontend.fonts.every((font) => font.hasArabicOrPua === false)).toBe(true);
});
