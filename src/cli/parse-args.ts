import { readFileSync } from "fs";
import { parseDiscoverArgs, type DiscoverArgs } from "../discovery/cli/parse.ts";
import { TranslationError } from "../translation/errors.ts";
import { RenderingError } from "../rendering/errors.ts";
import type { SourceText } from "../translation/types.ts";
import type { RenderCliArgs } from "./render-cmd.ts";
import { parsePatchArgs, type PatchArgs } from "./patch-cmd.ts";

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
  | DiscoverArgs
  | RenderCliArgs
  | PatchArgs;

export function parseCliArgs(argv: readonly string[]): CliArgs {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    return { command: "help" };
  }
  const command = argv[0];
  if (command === "discover") {
    return parseDiscoverArgs(argv.slice(1));
  }
  if (command === "render") {
    return parseRenderArgs(argv.slice(1));
  }
  if (command === "patch") {
    return parsePatchArgs(argv.slice(1));
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

function parsePositiveInt(val: string, name: string): number {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new RenderingError(`render ${name} must be a positive integer, got ${val}`, "INVALID_ARGUMENT");
  }
  return n;
}

function parseRenderArgs(argv: readonly string[]): RenderCliArgs {
  let font = "assets/fonts/force.ttf";
  let text = "";
  let width = 400;
  let size = 24;
  let height: number | undefined;
  let minimumSize: number | undefined;
  let lineGap: number | undefined;
  let padding: number | undefined;
  let direction: "ltr" | "rtl" | undefined;
  let alignment: "left" | "right" | "center" | undefined;
  let placeholderPolicy:
    | { readonly mode: "fixed-width"; readonly width: number }
    | { readonly mode: "sample-text"; readonly sample: string }
    | { readonly mode: "unresolved-diagnostic"; readonly severity?: "warning" | "error" }
    | undefined;
  let expandEscapes = false;
  let out: string | undefined;
  let svgOut: string | undefined;
  let htmlOut: string | undefined;
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "-h" || flag === "--help") {
      help = true;
      continue;
    }
    if (flag === "--font") {
      font = requiredRenderValue(argv, i, "--font");
      i += 1;
      continue;
    }
    if (flag === "--text") {
      text = requiredRenderValue(argv, i, "--text");
      i += 1;
      continue;
    }
    if (flag === "--input") {
      const inputPath = requiredRenderValue(argv, i, "--input");
      text = readFileSync(inputPath, "utf-8");
      i += 1;
      continue;
    }
    if (flag === "--width") {
      width = parsePositiveInt(requiredRenderValue(argv, i, "--width"), "--width");
      i += 1;
      continue;
    }
    if (flag === "--size") {
      size = parsePositiveInt(requiredRenderValue(argv, i, "--size"), "--size");
      i += 1;
      continue;
    }
    if (flag === "--height") {
      height = parsePositiveInt(requiredRenderValue(argv, i, "--height"), "--height");
      i += 1;
      continue;
    }
    if (flag === "--minimum-size") {
      minimumSize = parsePositiveInt(requiredRenderValue(argv, i, "--minimum-size"), "--minimum-size");
      i += 1;
      continue;
    }
    if (flag === "--line-gap") {
      const val = parseInt(requiredRenderValue(argv, i, "--line-gap"), 10);
      if (!Number.isFinite(val) || val < 0) {
        throw new RenderingError(`--line-gap must be a non-negative integer`, "INVALID_ARGUMENT");
      }
      lineGap = val;
      i += 1;
      continue;
    }
    if (flag === "--padding") {
      const val = parseInt(requiredRenderValue(argv, i, "--padding"), 10);
      if (!Number.isFinite(val) || val < 0) {
        throw new RenderingError(`--padding must be a non-negative integer`, "INVALID_ARGUMENT");
      }
      padding = val;
      i += 1;
      continue;
    }
    if (flag === "--direction") {
      const val = requiredRenderValue(argv, i, "--direction");
      if (val !== "ltr" && val !== "rtl") {
        throw new RenderingError("--direction must be ltr or rtl", "INVALID_ARGUMENT");
      }
      direction = val;
      i += 1;
      continue;
    }
    if (flag === "--align") {
      const val = requiredRenderValue(argv, i, "--align");
      if (val !== "left" && val !== "right" && val !== "center") {
        throw new RenderingError("--align must be left, right, or center", "INVALID_ARGUMENT");
      }
      alignment = val;
      i += 1;
      continue;
    }
    if (flag === "--placeholder") {
      const val = requiredRenderValue(argv, i, "--placeholder");
      if (val.startsWith("fixed:")) {
        const w = parseInt(val.slice(6), 10);
        if (!Number.isFinite(w) || w <= 0) {
          throw new RenderingError("--placeholder fixed:<width> requires a positive width", "INVALID_ARGUMENT");
        }
        placeholderPolicy = { mode: "fixed-width", width: w };
      } else if (val.startsWith("sample:")) {
        placeholderPolicy = { mode: "sample-text", sample: val.slice(7) };
      } else if (val === "warn") {
        placeholderPolicy = { mode: "unresolved-diagnostic", severity: "warning" };
      } else if (val === "error") {
        placeholderPolicy = { mode: "unresolved-diagnostic", severity: "error" };
      } else {
        throw new RenderingError(`unknown placeholder policy: ${val}`, "INVALID_ARGUMENT");
      }
      i += 1;
      continue;
    }
    if (flag === "--expand-escapes") {
      expandEscapes = true;
      continue;
    }
    if (flag === "--out") {
      out = requiredRenderValue(argv, i, "--out");
      i += 1;
      continue;
    }
    if (flag === "--svg") {
      svgOut = requiredRenderValue(argv, i, "--svg");
      i += 1;
      continue;
    }
    if (flag === "--html") {
      htmlOut = requiredRenderValue(argv, i, "--html");
      i += 1;
      continue;
    }
    if (flag === "--json") {
      json = true;
      continue;
    }
    throw new RenderingError(`Unknown render argument: ${flag}`, "INVALID_ARGUMENT");
  }

  return {
    command: "render",
    font,
    text,
    width,
    size,
    height,
    minimumSize,
    lineGap,
    padding,
    direction,
    alignment,
    placeholderPolicy,
    expandEscapes,
    out,
    svgOut,
    htmlOut,
    json,
    help,
  };
}

function requiredRenderValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--") || value === "-h") {
    throw new RenderingError(`${flag} requires a value`, "INVALID_ARGUMENT");
  }
  return value;
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--") || value === "-h") {
    throw new TranslationError("VALIDATION", `${flag} requires a value`);
  }
  return value;
}
