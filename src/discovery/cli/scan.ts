import { DiscoveryError } from "../errors.ts";
import { getGameAdapter } from "../games/registry.ts";
import { defaultScanReportPath, writeReport } from "../report/persist.ts";
import { formatSummary } from "../report/summary.ts";
import { scanGame } from "../scan.ts";
import type { DiscoverScanArgs } from "./parse.ts";

export type ScanCommandIo = {
  readonly stdout: { write(text: string): unknown };
};

export async function runDiscoverScan(args: DiscoverScanArgs, io: ScanCommandIo): Promise<number> {
  const adapter = getGameAdapter(args.game);
  const root = args.root ?? adapter.defaultRoot;
  if (root === undefined) {
    throw new DiscoveryError("VALIDATION", "discover scan requires --root");
  }
  const out = args.out ?? defaultScanReportPath(adapter.id);
  const report = await scanGame({ root, adapter });
  await writeReport(out, report);
  io.stdout.write(`wrote ${out}\n`);
  io.stdout.write(formatSummary(report));
  return 0;
}
