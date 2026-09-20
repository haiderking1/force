import { loadTranslationConfig } from "../translation/config/load.ts";
import { createTranslationClient } from "../translation/create-client.ts";
import { identityFingerprint, planCorpus } from "../translation/corpus/plan.ts";
import { checkpointPaths } from "../translation/checkpoint/paths.ts";
import { redactValue, secretsFromApiKey } from "../translation/diagnostics.ts";
import { loadExtractedStringTableCorpus } from "../translation/formats/extracted-strings/load.ts";
import { runCorpusJob } from "../translation/job/run.ts";
import { TranslationError } from "../translation/errors.ts";
import type { CliIo } from "./io.ts";
import type { TranslateCliArgs } from "./parse-args.ts";

export async function runTranslateFile(args: TranslateCliArgs, io: CliIo): Promise<number> {
  if (args.input === undefined || args.out === undefined) {
    throw new TranslationError("VALIDATION", "translate --input requires --out");
  }
  const planning = args.dryRun || args.plan;
  const config = loadTranslationConfig(io.env, { requireApiKey: !planning });
  const items = await loadExtractedStringTableCorpus(args.input);
  const plan = planCorpus({
    items,
    targetLanguage: (args.targetLanguage ?? config.targetLanguage).trim(),
    explicitPlaceholders: args.placeholders,
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    temperature: config.temperature,
    batchSize: config.batchSize,
    workers: config.workers,
  });
  const paths = checkpointPaths(args.out);
  io.stdout.write(`${formatFilePlan(args.input, args.out, plan, paths)}\n`);
  if (args.plan) {
    return 0;
  }
  const client = createTranslationClient(config, { fetch: io.fetch, sleep: io.sleep });
  if (args.dryRun) {
    const first = plan.batches[0];
    if (first === undefined) {
      throw new TranslationError("VALIDATION", "Translation plan has no batches");
    }
    const outbound = client.buildOutbound({
      targetLanguage: plan.targetLanguage,
      placeholders: plan.placeholders,
      items: first.items.map((item) => ({ id: item.id, text: item.text })),
    });
    const secrets = secretsFromApiKey(config.apiKey);
    io.stdout.write(`${JSON.stringify(redactValue(outbound, secrets), null, 2)}\n`);
    return 0;
  }
  const result = await runCorpusJob({
    plan,
    outDir: args.out,
    resume: args.resume,
    client,
    signal: io.signal,
    io: { stdout: io.stdout },
  });
  if (result.done !== result.total || result.failed > 0) {
    return 1;
  }
  return 0;
}

export function formatFilePlan(
  inputPath: string,
  outDir: string,
  plan: ReturnType<typeof planCorpus>,
  paths: ReturnType<typeof checkpointPaths>,
): string {
  const placeholderPreview =
    plan.placeholders.length === 0 ? "(none)" : plan.placeholders.join(" ");
  return [
    "translate plan",
    `input ${inputPath}`,
    `out ${outDir}`,
    `items ${plan.items.length}`,
    `batches ${plan.batches.length}`,
    `workers ${plan.workers}`,
    `batchSize ${plan.batchSize}`,
    `target ${plan.targetLanguage}`,
    `placeholders ${plan.placeholders.length} ${placeholderPreview}`,
    `source ${plan.identity.sourceHash}`,
    `identity ${identityFingerprint(plan.identity)}`,
    `status ${paths.status}`,
    `checkpoint ${paths.batchesDir}`,
    `items ${paths.itemsDir}`,
    `unresolved ${paths.unresolved}`,
    `assembled ${paths.assembled}`,
  ].join("\n");
}
