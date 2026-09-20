import { formatDrilldown } from "../report/drilldown.ts";
import { readReport } from "../report/persist.ts";
import { formatSummary } from "../report/summary.ts";
import type { DiscoverShowArgs, DiscoverSummaryArgs } from "./parse.ts";

export type ShowCommandIo = {
  readonly stdout: { write(text: string): unknown };
};

export async function runDiscoverSummary(args: DiscoverSummaryArgs, io: ShowCommandIo): Promise<number> {
  const report = await readReport(args.report);
  io.stdout.write(formatSummary(report));
  return 0;
}

export async function runDiscoverShow(args: DiscoverShowArgs, io: ShowCommandIo): Promise<number> {
  const report = await readReport(args.report);
  io.stdout.write(formatDrilldown(report, args.id));
  return 0;
}
