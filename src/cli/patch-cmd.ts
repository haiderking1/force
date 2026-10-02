import { readFile } from "node:fs/promises";
import path from "node:path";
import { PatchError } from "../patch/errors.ts";
import { resolveBrutalLegendRoot } from "../games/brutal-legend/root.ts";
import { BRUTAL_LEGEND_PROCESS_NAMES } from "../games/brutal-legend/config.ts";
import { applyStagedPatch } from "../patch/install/apply.ts";
import { restoreFromBackup, stagedFilesFromManifest } from "../patch/install/restore.ts";
import { assertStageFontComplete } from "../patch/install/stage-gate.ts";
import { stageBrutalLegendGameText } from "../games/brutal-legend/stage/game-text.ts";
import { stageBrutalLegendMainMenu } from "../games/brutal-legend/stage/main-menu.ts";
import { loadTranslations } from "../patch/translations/load.ts";
import type { CliIo } from "./io.ts";

export type PatchStageArgs = {
  readonly command: "patch";
  readonly action: "stage";
  readonly game: string;
  readonly scope: string;
  readonly root: string | undefined;
  readonly out: string | undefined;
  readonly translations: readonly string[];
  readonly candidates: readonly string[];
  readonly help: boolean;
};

export type PatchApplyArgs = {
  readonly command: "patch";
  readonly action: "apply";
  readonly stage: string | undefined;
  readonly backup: string | undefined;
  readonly confirm: boolean;
  readonly help: boolean;
};

export type PatchRestoreArgs = {
  readonly command: "patch";
  readonly action: "restore";
  readonly backup: string | undefined;
  readonly confirm: boolean;
  readonly help: boolean;
};

export type PatchHelpArgs = {
  readonly command: "patch";
  readonly action: "help";
};

export type PatchArgs = PatchStageArgs | PatchApplyArgs | PatchRestoreArgs | PatchHelpArgs;

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--") || value === "-h") {
    throw new PatchError("VALIDATION", `${flag} requires a value`);
  }
  return value;
}

export function parsePatchArgs(argv: readonly string[]): PatchArgs {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    return { command: "patch", action: "help" };
  }
  const action = argv[0];
  if (action !== "stage" && action !== "apply" && action !== "restore") {
    throw new PatchError("VALIDATION", `Unknown patch action: ${action}`);
  }
  let game: string | undefined;
  let scope: string | undefined;
  let root: string | undefined;
  let out: string | undefined;
  const translations: string[] = [];
  const candidates: string[] = [];
  let stage: string | undefined;
  let backup: string | undefined;
  let confirm = false;
  let help = false;
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "-h" || flag === "--help") {
      help = true;
      continue;
    }
    if (flag === "--confirm") {
      confirm = true;
      continue;
    }
    if (flag === "--game") {
      game = requiredValue(argv, index, "--game");
      index += 1;
      continue;
    }
    if (flag === "--scope") {
      scope = requiredValue(argv, index, "--scope");
      index += 1;
      continue;
    }
    if (flag === "--root") {
      root = requiredValue(argv, index, "--root");
      index += 1;
      continue;
    }
    if (flag === "--out") {
      out = requiredValue(argv, index, "--out");
      index += 1;
      continue;
    }
    if (action === "stage" && (flag === "--translations" || flag === "--candidates")) {
      const paths = flag === "--translations" ? translations : candidates;
      paths.push(requiredValue(argv, index, flag));
      index += 1;
      continue;
    }
    if (flag === "--stage") {
      stage = requiredValue(argv, index, "--stage");
      index += 1;
      continue;
    }
    if (flag === "--backup") {
      backup = requiredValue(argv, index, "--backup");
      index += 1;
      continue;
    }
    throw new PatchError("VALIDATION", `Unknown argument: ${flag}`);
  }
  if (action === "stage") {
    if (!help && translations.length === 0) {
      throw new PatchError("VALIDATION", "patch stage requires at least one --translations <file>");
    }
    if (candidates.length > 0 && (scope ?? "main-menu") !== "main-menu") {
      throw new PatchError("VALIDATION", "--candidates is only valid for --scope main-menu");
    }
    return {
      command: "patch",
      action: "stage",
      game: game ?? "brutal-legend",
      scope: scope ?? "main-menu",
      root,
      out,
      translations,
      candidates,
      help,
    };
  }
  if (action === "apply") {
    return { command: "patch", action: "apply", stage, backup, confirm, help };
  }
  return { command: "patch", action: "restore", backup, confirm, help };
}

export const PATCH_USAGE = `patch stage --game brutal-legend --scope main-menu|game-text --translations <file> [--translations <file> ...] [--candidates <file>] [--root <game>] [--out <dir>]
  patch apply --stage <dir> --backup <dir> --confirm
  patch restore --backup <dir> --confirm

patch stage writes rebuilt StringTable and font GFX packs under a new
experiment directory. It does not modify the installed game. --scope game-text
encodes remaining translated strings, appends shared PUA glyphs, and lowers
subtitle.gfx. patch apply is an explicit opt-in and refuses a running game,
checksum mismatch, or a font-incomplete stage.

--translations is required and repeatable; earlier files win for duplicate ids.
--candidates is optional and repeatable for main-menu only; candidate files
precede all translation files. Paths resolve from the current working directory.
Every input must exist and parse. Reports record input paths, SHA-256 hashes,
and the winning source for each id.
`;

export async function runPatchCommand(args: PatchArgs, io: CliIo): Promise<number> {
  if (args.action === "help" || ("help" in args && args.help)) {
    io.stdout.write(PATCH_USAGE);
    return 0;
  }
  if (args.action === "stage") {
    if (args.game !== "brutal-legend") {
      throw new PatchError("CONFIG", `Unknown patch game '${args.game}'`);
    }
    if (args.scope !== "main-menu" && args.scope !== "game-text") {
      throw new PatchError("VALIDATION", `Unknown patch scope '${args.scope}'`);
    }
    const outDir =
      args.out ??
      (args.scope === "game-text"
        ? "out/experiments/brutal-legend-game-text-v1"
        : "out/experiments/brutal-legend-main-menu-arabic-v3");
    const translationInputs = await loadTranslations(args.translations, args.candidates);
    const result =
      args.scope === "game-text"
        ? await stageBrutalLegendGameText({
            gameRoot: resolveBrutalLegendRoot(io.env, args.root),
            outDir,
            workspaceRoot: process.cwd(),
            translationInputs,
          })
        : await stageBrutalLegendMainMenu({
            env: io.env,
            gameRoot: resolveBrutalLegendRoot(io.env, args.root),
            outDir,
            workspaceRoot: process.cwd(),
            translationInputs,
          });
    io.stdout.write(`staged ${result.outDir}\n`);
    io.stdout.write("installed game files were not modified\n");
    return 0;
  }
  if (args.action === "apply") {
    if (args.stage === undefined || args.backup === undefined) {
      throw new PatchError("VALIDATION", "patch apply requires --stage and --backup");
    }
    const manifest = JSON.parse(await readFile(path.join(args.stage, "install-manifest.json"), "utf8")) as {
      gameRoot: string;
      files: {
        relativePath: string;
        stagedRelativePath: string;
        originalSha256: string;
        originalBytes: number;
        stagedSha256: string;
        stagedBytes: number;
      }[];
    };
    assertStageFontComplete(manifest);
    const result = await applyStagedPatch({
      gameRoot: manifest.gameRoot,
      backupDir: args.backup,
      files: stagedFilesFromManifest(args.stage, manifest.files),
      confirm: args.confirm,
      processNames: BRUTAL_LEGEND_PROCESS_NAMES,
    });
    io.stdout.write(`applied ${result.installed.length} files, backup ${result.backupDir}\n`);
    return 0;
  }
  if (args.backup === undefined) {
    throw new PatchError("VALIDATION", "patch restore requires --backup");
  }
  const result = await restoreFromBackup({
    backupDir: args.backup,
    confirm: args.confirm,
    processNames: BRUTAL_LEGEND_PROCESS_NAMES,
  });
  io.stdout.write(`restored ${result.restored.length} files from ${args.backup}\n`);
  return 0;
}
