import { stageSubtitleIntro } from "../../src/patch/stage/subtitle-intro.ts";

const [gameRoot, out, ...extra] = process.argv.slice(2);
if (!gameRoot || !out || extra.length) {
  throw new Error("Usage: bun --no-env-file scripts/subtitles/stage-intro.ts GAME_ROOT NEW_STAGE_DIRECTORY");
}
await stageSubtitleIntro(gameRoot, out);
