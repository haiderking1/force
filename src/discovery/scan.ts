import path from "node:path";
import type { GameAdapter } from "./games/types.ts";
import { extractAllEvidence } from "./evidence/extract.ts";
import { buildInventory } from "./inventory/inventory.ts";
import { sortByLocalEvidence, toRankedResource } from "./report/rank.ts";
import { REPORT_SCHEMA_VERSION, type DiscoveryReport } from "./report/types.ts";

export type ScanOptions = {
  readonly root: string;
  readonly adapter: GameAdapter;
  readonly now?: () => string;
};

export async function scanGame(options: ScanOptions): Promise<DiscoveryReport> {
  const inventory = await buildInventory(options.root, options.adapter);
  const evidence = await extractAllEvidence(options.root, inventory.records, options.adapter, (root, relative) =>
    path.join(root, relative),
  );
  const evidenceMap = new Map(evidence.map((item) => [item.resourceId, item]));
  const resources = sortByLocalEvidence(
    inventory.records.map((record) =>
      toRankedResource(record, inventory.records, evidenceMap.get(record.id), options.adapter),
    ),
  );
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: options.now?.() ?? new Date().toISOString(),
    gameId: options.adapter.id,
    root: options.root,
    mode: "scan",
    rankingMethod: "local-evidence",
    jev: { ran: false },
    coverage: inventory.coverage,
    resources,
  };
}
