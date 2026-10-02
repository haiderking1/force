import { stageSubtitleIntro } from "../../src/games/brutal-legend/stage/subtitle-intro.ts";
import { loadTranslations } from "../../src/patch/translations/load.ts";
import { parseTranslationArgs } from "./cli/translation-args.ts";

const usage = "Usage: bun --no-env-file scripts/subtitles/stage-intro.ts GAME_ROOT NEW_STAGE_DIRECTORY --translations <file> [--translations <file> ...]";
const args = parseTranslationArgs(process.argv.slice(2), { usage, minPositionals: 2, maxPositionals: 2 });
const [gameRoot, out] = args.positionals;
if (!gameRoot || !out) throw new Error(usage);
const translationInputs = await loadTranslations(args.translations);
await stageSubtitleIntro(gameRoot, out, translationInputs);
