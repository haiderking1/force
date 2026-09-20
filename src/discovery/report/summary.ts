import type { DiscoveryReport, RankedResource } from "./types.ts";

function roleLine(resource: RankedResource): string {
  if (resource.roles === undefined) {
    return "roles: none (not Jev-classified)";
  }
  const roles = resource.roles;
  return `ui=${roles.playerVisibleUiText.toFixed(3)} dialogue=${roles.spokenDialogueOrSubtitles.toFixed(3)} reference=${roles.referenceOnly.toFixed(3)} debug=${roles.debugOrInternal.toFixed(3)} insufficient=${roles.insufficientEvidence.toFixed(3)}`;
}

function samplePreview(resource: RankedResource): string {
  const first = resource.evidence.samples[0];
  if (first === undefined) {
    const reference = resource.evidence.references[0];
    if (reference === undefined) {
      return "no samples";
    }
    return `ref ${reference.value}${reference.typeName !== undefined ? `:${reference.typeName}` : ""} @ ${reference.sourceOffset}`;
  }
  const preview = first.text.length > 80 ? `${first.text.slice(0, 80)}…` : first.text;
  return `${first.encoding} ${first.offsetSpace}@${first.offset}: ${preview}`;
}

export function formatSummary(report: DiscoveryReport, limit = 20): string {
  const lines = [
    `game ${report.gameId}`,
    `mode ${report.mode}`,
    `ranking ${report.rankingMethod}`,
    `jev ${report.jev.ran ? `ran model=${report.jev.resolvedModel ?? report.jev.model}` : "not run"}`,
    `files inventoried ${report.coverage.filesInventoried} / seen ${report.coverage.filesSeen}`,
    `walk exclusions ${report.coverage.walkExclusions.length}`,
    `evidence skipped ${report.coverage.evidenceSkipped.length}`,
    `unsupported ${report.coverage.unsupportedFormats.join(", ") || "none"}`,
    `pack entry extraction ${report.coverage.packEntryExtraction}`,
    `Jev ranks supplied evidence. It does not prove the game renders a string, and it does not unpack unknown archives.`,
    "",
    `top ${Math.min(limit, report.resources.length)}`,
  ];
  for (const resource of report.resources.slice(0, limit)) {
    const archive = resource.archive === undefined ? "" : ` archive=${resource.archive.payloadPath ?? resource.archive.familyId}`;
    lines.push(
      `${resource.relativePath} status=${resource.status} local=${resource.localScore}${archive}`,
    );
    lines.push(`  ${roleLine(resource)}`);
    lines.push(`  ${samplePreview(resource)}`);
  }
  return `${lines.join("\n")}\n`;
}
