import { runDiscoverClassify } from "../discovery/cli/classify-cmd.ts";
import { runDiscoverPackExtract, runDiscoverPackList, runDiscoverPackStrings } from "../discovery/cli/pack.ts";
import { runDiscoverScan } from "../discovery/cli/scan.ts";
import { runDiscoverShow, runDiscoverSummary } from "../discovery/cli/show.ts";
import { DiscoveryError, isDiscoveryError } from "../discovery/errors.ts";
import { isArchiveError } from "../archive/errors.ts";
import { loadTranslationConfig } from "../translation/config/load.ts";
import { createTranslationClient } from "../translation/create-client.ts";
import { redactValue, secretsFromApiKey } from "../translation/diagnostics.ts";
import { isTranslationError } from "../translation/errors.ts";
import type { TranslateRequest } from "../translation/types.ts";
import { errorMessage } from "../translation/unknown.ts";
import type { CliIo } from "./io.ts";
import { parseCliArgs } from "./parse-args.ts";
import { runTranslateFile } from "./translate-file.ts";
import { USAGE } from "./usage.ts";

export type { CliIo, CliWriter } from "./io.ts";

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
    if (args.command === "discover") {
      return await runDiscoverCommand(args, io);
    }
    if (args.help) {
      io.stdout.write(USAGE);
      return 0;
    }
    if (args.input !== undefined) {
      return await runTranslateFile(args, io);
    }
    if (args.items.length === 0) {
      io.stderr.write("translate requires at least one --id and --text pair, or --input and --out\n");
      io.stderr.write(USAGE);
      return 1;
    }

    const config = loadTranslationConfig(io.env, { requireApiKey: !args.dryRun });
    const request: TranslateRequest = {
      targetLanguage: (args.targetLanguage ?? config.targetLanguage).trim(),
      items: args.items,
      placeholders: args.placeholders,
    };
    const client = createTranslationClient(config, { fetch: io.fetch, sleep: io.sleep });
    const outbound = client.buildOutbound(request);
    if (args.dryRun) {
      const secrets = secretsFromApiKey(config.apiKey);
      io.stdout.write(`${JSON.stringify(redactValue(outbound, secrets), null, 2)}\n`);
      return 0;
    }

    const result = await client.translate(request, { signal: io.signal });
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (isDiscoveryError(error) || isTranslationError(error) || isArchiveError(error)) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
    io.stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }
}

async function runDiscoverCommand(
  args: Extract<Awaited<ReturnType<typeof parseCliArgs>>, { command: "discover" }>,
  io: CliIo,
): Promise<number> {
  if (args.action === "help" || ("help" in args && args.help)) {
    io.stdout.write(USAGE);
    return 0;
  }
  if (args.action === "scan") {
    return runDiscoverScan(args, io);
  }
  if (args.action === "classify") {
    return runDiscoverClassify(args, {
      env: io.env,
      stdout: io.stdout,
      fetch: io.fetch,
      sleep: io.sleep,
      signal: io.signal,
    });
  }
  if (args.action === "summary") {
    return runDiscoverSummary(args, io);
  }
  if (args.action === "show") {
    return runDiscoverShow(args, io);
  }
  if (args.action === "pack-list") {
    return runDiscoverPackList(args, io);
  }
  if (args.action === "pack-extract") {
    return runDiscoverPackExtract(args, io);
  }
  if (args.action === "pack-strings") {
    return runDiscoverPackStrings(args, io);
  }
  const exhausted: never = args;
  throw new DiscoveryError("VALIDATION", `Unhandled discover action: ${JSON.stringify(exhausted)}`);
}
