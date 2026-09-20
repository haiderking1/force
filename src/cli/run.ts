import { loadTranslationConfig } from "../translation/config/load.ts";
import type { EnvRecord } from "../translation/config/schema.ts";
import { createTranslationClient } from "../translation/create-client.ts";
import { redactValue, secretsFromApiKey } from "../translation/diagnostics.ts";
import { isTranslationError } from "../translation/errors.ts";
import type { FetchLike } from "../translation/http/openai-compatible-client.ts";
import type { TranslateRequest } from "../translation/types.ts";
import { errorMessage } from "../translation/unknown.ts";
import { parseCliArgs } from "./parse-args.ts";
import { USAGE } from "./usage.ts";

export type CliWriter = {
  write(text: string): unknown;
};

export type CliIo = {
  readonly env: EnvRecord;
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly fetch?: FetchLike;
};

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    const args = parseCliArgs(argv);
    if (args.command === "help") {
      io.stdout.write(USAGE);
      return 0;
    }
    if (args.command === "unknown") {
      io.stderr.write(`Unknown command: ${args.value}\n`);
      io.stderr.write(USAGE);
      return 1;
    }
    if (args.help) {
      io.stdout.write(USAGE);
      return 0;
    }
    if (args.items.length === 0) {
      io.stderr.write("translate requires at least one --id and --text pair\n");
      io.stderr.write(USAGE);
      return 1;
    }

    const config = loadTranslationConfig(io.env, { requireApiKey: !args.dryRun });
    const request: TranslateRequest = {
      targetLanguage: (args.targetLanguage ?? config.targetLanguage).trim(),
      items: args.items,
      placeholders: args.placeholders,
    };
    const client = createTranslationClient(config, { fetch: io.fetch });
    const outbound = client.buildOutbound(request);
    if (args.dryRun) {
      const secrets = secretsFromApiKey(config.apiKey);
      io.stdout.write(`${JSON.stringify(redactValue(outbound, secrets), null, 2)}\n`);
      return 0;
    }

    const result = await client.translate(request);
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = isTranslationError(error) ? error.message : errorMessage(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}
