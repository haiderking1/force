import { classifyReport } from "../classify/classify.ts";
import { createJevClient, type JevClientDependencies } from "../classify/client.ts";
import { loadJevConfig, type EnvRecord } from "../classify/config.ts";
import { defaultClassifiedReportPath, readReport, writeReport } from "../report/persist.ts";
import { formatSummary } from "../report/summary.ts";
import type { DiscoverClassifyArgs } from "./parse.ts";

export type ClassifyCommandIo = {
  readonly env: EnvRecord;
  readonly stdout: { write(text: string): unknown };
  readonly fetch?: JevClientDependencies["fetch"];
  readonly sleep?: JevClientDependencies["sleep"];
  readonly signal?: AbortSignal;
};

export async function runDiscoverClassify(args: DiscoverClassifyArgs, io: ClassifyCommandIo): Promise<number> {
  const config = loadJevConfig(io.env, { requireApiKey: true });
  const report = await readReport(args.report);
  const out = args.out ?? defaultClassifiedReportPath(report.gameId);
  const client = createJevClient(config, { fetch: io.fetch, sleep: io.sleep });
  const classified = await classifyReport(report, {
    client,
    model: config.model,
    concurrency: config.concurrency,
    signal: io.signal,
    cacheDir: `out/discovery/cache/${report.gameId}`,
  });
  await writeReport(out, classified);
  io.stdout.write(`wrote ${out}\n`);
  io.stdout.write(formatSummary(classified));
  return 0;
}
