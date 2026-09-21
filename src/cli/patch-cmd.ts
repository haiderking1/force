import { readFile } from "node:fs/promises";
import path from "node:path";
import { PatchError } from "../patch/errors.ts";
import { BRUTAL_LEGEND_DEFAULT_ROOT } from "../patch/games/brutal-legend/config.ts";
import { applyStagedPatch } from "../patch/install/apply.ts";
import { restoreFromBackup, stagedFilesFromManifest } from "../patch/install/restore.ts";
import { assertStageFontComplete } from "../patch/install/stage-gate.ts";
import { stageBrutalLegendMainMenu } from "../patch/stage/run.ts";
import type { CliIo } from "./io.ts";

export type PatchStageArgs = {
  readonly command: "patch";
  readonly action: "stage";
  readonly game: string;
  readonly scope: string;
  readonly root: string | undefined;
  readonly out: string | undefined;
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
    return {
      command: "patch",
      action: "stage",
      game: game ?? "brutal-legend",
      scope: scope ?? "main-menu",
      root,
      out,
      help,
    };
  }
  if (action === "apply") {
    return { command: "patch", action: "apply", stage, backup, confirm, help };
  }
  return { command: "patch", action: "restore", backup, confirm, help };
}

export const PATCH_USAGE = `patch stage --game brutal-legend --scope main-menu [--root <game>] [--out <dir>]
  patch apply --stage <dir> --backup <dir> --confirm
  patch restore --backup <dir> --confirm

patch stage writes rebuilt StringTable and font GFX packs under a new
experiment directory. It does not modify the installed game. patch apply is
an explicit opt-in and refuses a running game, checksum mismatch, or a
font-incomplete stage.
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
    if (args.scope !== "main-menu") {
      throw new PatchError("VALIDATION", "Only --scope main-menu is implemented");
    }
    const outDir = args.out ?? "out/experiments/brutal-legend-main-menu-arabic-v2";
    const result = await stageBrutalLegendMainMenu({
      gameRoot: args.root ?? BRUTAL_LEGEND_DEFAULT_ROOT,
      outDir,
      workspaceRoot: process.cwd(),
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
    });
    io.stdout.write(`applied ${result.installed.length} files, backup ${result.backupDir}\n`);
    return 0;
  }
  if (args.backup === undefined) {
    throw new PatchError("VALIDATION", "patch restore requires --backup");
  }
  const result = await restoreFromBackup({ backupDir: args.backup, confirm: args.confirm });
  io.stdout.write(`restored ${result.restored.length} files from ${args.backup}\n`);
  return 0;
}
