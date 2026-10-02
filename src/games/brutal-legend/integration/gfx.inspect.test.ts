import { expect, test } from "bun:test";
import { originalGamePack } from "./original-game.ts";
import { extractBuddhaEntry } from "../../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../../archive/buddha/open.ts";
import {
  BRUTAL_LEGEND_FRONTEND_GFX_ENTRY,
  BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_GFX_PACK,
} from "../config.ts";
import { inspectGfxBytes } from "../../../patch/gfx/inspect.ts";

test("production FrontEnd.gfx has starred menu line codes and Latin-only fonts", async () => {
  // This assertion describes the unmodified game, not an installed Arabic patch.
  const { headerPath, payloadPath } = await originalGamePack(BRUTAL_LEGEND_GFX_PACK, process.env);
  const list = await openBuddhaPack({ headerPath, payloadPath });
  const frontend = inspectGfxBytes((await extractBuddhaEntry(list, BRUTAL_LEGEND_FRONTEND_GFX_ENTRY)).bytes);
  const fonts = inspectGfxBytes((await extractBuddhaEntry(list, BRUTAL_LEGEND_FONTS_GFX_ENTRY)).bytes);
  expect(frontend.starredLineCodes).toContain("PMTE028TEXT");
  expect(frontend.starredLineCodes).not.toContain("TOGU042TEXT");
  expect(frontend.lineCodes.some((hit) => hit.lineCode === "TOGU042TEXT")).toBe(false);
  expect(fonts.fonts.map((font) => font.name)).toEqual(["Schreibweise", "TG_Menu", "TG_Condensed"]);
  expect(fonts.fonts.every((font) => font.hasArabicOrPua === false)).toBe(true);
  expect(frontend.fonts.every((font) => font.hasArabicOrPua === false)).toBe(true);
});
