import { parseDiscoverArgs, type DiscoverArgs } from "../discovery/cli/parse.ts";
import { TranslationError } from "../translation/errors.ts";
import type { SourceText } from "../translation/types.ts";

export type TranslateCliArgs = {
  readonly command: "translate";
  readonly items: readonly SourceText[];
  readonly placeholders: readonly string[];
  readonly targetLanguage: string | undefined;
  readonly input: string | undefined;
  readonly out: string | undefined;
  readonly resume: boolean;
  readonly plan: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
};

export type CliArgs =
  | { readonly command: "help" }
  | { readonly command: "unknown"; readonly value: string }
  | TranslateCliArgs
  | DiscoverArgs;

export function parseCliArgs(argv: readonly string[]): CliArgs {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    return { command: "help" };
  }
  const command = argv[0];
  if (command === "discover") {
    return parseDiscoverArgs(argv.slice(1));
  }
  if (command !== "translate") {
    return { command: "unknown", value: command ?? "" };
  }

  const items: SourceText[] = [];
  const placeholders: string[] = [];
  let targetLanguage: string | undefined;
  let input: string | undefined;
  let out: string | undefined;
  let resume = false;
  let plan = false;
  let dryRun = false;
  let help = false;
  let pendingId: string | undefined;

  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "-h" || flag === "--help") {
      help = true;
      continue;
    }
    if (flag === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (flag === "--plan") {
      plan = true;
      continue;
    }
    if (flag === "--resume") {
      resume = true;
      continue;
    }
    if (flag === "--target") {
      targetLanguage = requiredValue(argv, index, "--target");
      index += 1;
      continue;
    }
    if (flag === "--placeholder") {
      placeholders.push(requiredValue(argv, index, "--placeholder"));
      index += 1;
      continue;
    }
    if (flag === "--input") {
      input = requiredValue(argv, index, "--input");
      index += 1;
      continue;
    }
    if (flag === "--out") {
      out = requiredValue(argv, index, "--out");
      index += 1;
      continue;
    }
    if (flag === "--id") {
      if (pendingId !== undefined) {
        throw new TranslationError("VALIDATION", "Each --id must be followed by --text");
      }
      pendingId = requiredValue(argv, index, "--id");
      index += 1;
      continue;
    }
    if (flag === "--text") {
      if (pendingId === undefined) {
        throw new TranslationError("VALIDATION", "Each --text must follow --id");
      }
      items.push({ id: pendingId, text: requiredValue(argv, index, "--text") });
      pendingId = undefined;
      index += 1;
      continue;
    }
    throw new TranslationError("VALIDATION", `Unknown argument: ${flag}`);
  }

  if (pendingId !== undefined) {
    throw new TranslationError("VALIDATION", "Each --id must be followed by --text");
  }
  if (input !== undefined && items.length > 0) {
    throw new TranslationError("VALIDATION", "translate --input cannot be combined with --id/--text");
  }
  if (out !== undefined && input === undefined) {
    throw new TranslationError("VALIDATION", "translate --out requires --input");
  }
  if (resume && input === undefined) {
    throw new TranslationError("VALIDATION", "translate --resume requires --input");
  }
  if (plan && input === undefined) {
    throw new TranslationError("VALIDATION", "translate --plan requires --input");
  }
  if (input !== undefined && out === undefined && !help) {
    throw new TranslationError("VALIDATION", "translate --input requires --out");
  }

  return {
    command: "translate",
    items,
    placeholders,
    targetLanguage,
    input,
    out,
    resume,
    plan,
    dryRun,
    help,
  };
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--") || value === "-h") {
    throw new TranslationError("VALIDATION", `${flag} requires a value`);
  }
  return value;
}
