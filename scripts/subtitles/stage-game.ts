import { BRUTAL_LEGEND_DEFAULT_ROOT } from "../../src/patch/games/brutal-legend/config.ts";
import { stageBrutalLegendGameText } from "../../src/patch/stage/game-text.ts";

const [gameRoot, out, ...extra] = process.argv.slice(2);
if (extra.length) {
  throw new Error("Usage: bun --no-env-file scripts/subtitles/stage-game.ts [GAME_ROOT] [NEW_STAGE_DIRECTORY]");
}
await stageBrutalLegendGameText({
  gameRoot: gameRoot ?? BRUTAL_LEGEND_DEFAULT_ROOT,
  outDir: out ?? "out/experiments/brutal-legend-game-text-v1",
  workspaceRoot: process.cwd(),
});
