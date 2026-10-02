import { PatchError } from "../../../src/patch/errors.ts";

export function parseTranslationArgs(argv: readonly string[], options: {
  readonly usage: string;
  readonly minPositionals: number;
  readonly maxPositionals: number;
  readonly allowCorpus?: boolean;
}): { readonly positionals: readonly string[]; readonly translations: readonly string[]; readonly corpus?: string } {
  const positionals: string[] = [];
  const translations: string[] = [];
  let corpus: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--translations" || (arg === "--corpus" && options.allowCorpus)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new PatchError("VALIDATION", `${arg} requires a file path. ${options.usage}`);
      }
      if (arg === "--translations") translations.push(value);
      else corpus = value;
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new PatchError("VALIDATION", `Unknown argument: ${arg}. ${options.usage}`);
    } else {
      positionals.push(arg);
    }
  }
  if (translations.length === 0) {
    throw new PatchError("VALIDATION", `At least one --translations <file> is required. ${options.usage}`);
  }
  if (positionals.length < options.minPositionals || positionals.length > options.maxPositionals) {
    throw new PatchError("VALIDATION", options.usage);
  }
  return { positionals, translations, corpus };
}
