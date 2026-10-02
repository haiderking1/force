import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveBrutalLegendRoot } from "../root.ts";
import { originalGamePack, resolveOriginalGameRoot } from "./original-game.ts";

test("original-game fixture root overrides the install root", () => {
  expect(resolveOriginalGameRoot({
    FORCE_TEST_ORIGINAL_GAME_ROOT: "/fixture/game",
    BRUTAL_LEGEND_ROOT: "/installed/game",
  })).toBe("/fixture/game");
});

test("original-game fixture falls back to the game root resolver", () => {
  expect(resolveOriginalGameRoot({ BRUTAL_LEGEND_ROOT: "/installed/game" })).toBe("/installed/game");
  expect(resolveOriginalGameRoot({})).toBe(resolveBrutalLegendRoot({}));
  expect(resolveOriginalGameRoot({ FORCE_TEST_ORIGINAL_GAME_ROOT: "", BRUTAL_LEGEND_ROOT: "/installed/game" })).toBe("/installed/game");
});

test("original-game fixture requires both pack files without falling back from a configured fixture", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "force-original-game-"));
  const env = { FORCE_TEST_ORIGINAL_GAME_ROOT: root, BRUTAL_LEGEND_ROOT: "/unused/install" };
  const headerPath = path.join(root, "Win/Packs/Test.~h");
  const payloadPath = path.join(root, "Win/Packs/Test.~p");
  try {
    await expect(originalGamePack("Win/Packs/Test.~h", env)).rejects.toThrow(
      `Missing original Brütal Legend fixture file: ${headerPath}. Set FORCE_TEST_ORIGINAL_GAME_ROOT`,
    );
    await mkdir(path.dirname(headerPath), { recursive: true });
    await writeFile(headerPath, "header");
    await expect(originalGamePack("Win/Packs/Test.~h", env)).rejects.toThrow(
      `Missing original Brütal Legend fixture file: ${payloadPath}. Set FORCE_TEST_ORIGINAL_GAME_ROOT`,
    );
    await writeFile(payloadPath, "payload");
    expect(await originalGamePack("Win/Packs/Test.~h", env)).toEqual({ headerPath, payloadPath });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
