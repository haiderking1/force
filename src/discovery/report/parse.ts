import { DiscoveryError } from "../errors.ts";
import { REPORT_SCHEMA_VERSION, type DiscoveryReport, type RankedResource } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRankedResource(value: unknown): value is RankedResource {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.relativePath === "string" &&
    typeof value.size === "number" &&
    typeof value.kind === "string" &&
    isRecord(value.evidence) &&
    typeof value.status === "string" &&
    typeof value.localScore === "number"
  );
}

export function parseDiscoveryReport(value: unknown): DiscoveryReport {
  if (!isRecord(value)) {
    throw new DiscoveryError("REPORT", "Discovery report must be an object");
  }
  if (value.schemaVersion !== REPORT_SCHEMA_VERSION) {
    throw new DiscoveryError("REPORT", "Discovery report schema is unsupported or missing resources");
  }
  if (!Array.isArray(value.resources) || !value.resources.every(isRankedResource)) {
    throw new DiscoveryError("REPORT", "Discovery report schema is unsupported or missing resources");
  }
  if (
    typeof value.generatedAt !== "string" ||
    typeof value.gameId !== "string" ||
    typeof value.root !== "string" ||
    (value.mode !== "scan" && value.mode !== "classified") ||
    (value.rankingMethod !== "local-evidence" && value.rankingMethod !== "jev-roles") ||
    !isRecord(value.jev) ||
    !isRecord(value.coverage)
  ) {
    throw new DiscoveryError("REPORT", "Discovery report schema is unsupported or missing resources");
  }
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: value.generatedAt,
    gameId: value.gameId,
    root: value.root,
    mode: value.mode,
    rankingMethod: value.rankingMethod,
    jev: value.jev.ran === true
      ? {
          ran: true,
          model: typeof value.jev.model === "string" ? value.jev.model : "",
          resolvedModel: typeof value.jev.resolvedModel === "string" ? value.jev.resolvedModel : undefined,
          questionSetVersion: typeof value.jev.questionSetVersion === "string" ? value.jev.questionSetVersion : "",
          contractSources: Array.isArray(value.jev.contractSources)
            ? value.jev.contractSources.filter((item): item is string => typeof item === "string")
            : [],
        }
      : { ran: false },
    coverage: parseCoverage(value.coverage),
    resources: value.resources,
  };
}

function parseCoverage(value: Record<string, unknown>): DiscoveryReport["coverage"] {
  const walkExclusions = Array.isArray(value.walkExclusions) ? value.walkExclusions : [];
  const evidenceSkipped = Array.isArray(value.evidenceSkipped) ? value.evidenceSkipped : [];
  const unsupportedFormats = Array.isArray(value.unsupportedFormats)
    ? value.unsupportedFormats.filter((item): item is string => typeof item === "string")
    : [];
  const notes = Array.isArray(value.notes)
    ? value.notes.filter((item): item is string => typeof item === "string")
    : [];
  return {
    root: typeof value.root === "string" ? value.root : "",
    filesSeen: typeof value.filesSeen === "number" ? value.filesSeen : 0,
    filesInventoried: typeof value.filesInventoried === "number" ? value.filesInventoried : 0,
    walkExclusions: walkExclusions.filter((item): item is DiscoveryReport["coverage"]["walkExclusions"][number] => {
      return (
        typeof item === "object" &&
        item !== null &&
        "relativePath" in item &&
        "reason" in item &&
        "detail" in item
      );
    }),
    evidenceSkipped: evidenceSkipped.filter((item): item is DiscoveryReport["coverage"]["evidenceSkipped"][number] => {
      return typeof item === "object" && item !== null && "id" in item && "reason" in item;
    }),
    unsupportedFormats,
    packEntryExtraction: value.packEntryExtraction === "supported" ? "supported" : "unsupported",
    notes,
  };
}
