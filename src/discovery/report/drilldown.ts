import { DiscoveryError } from "../errors.ts";
import type { DiscoveryReport } from "./types.ts";

export function formatDrilldown(report: DiscoveryReport, id: string): string {
  const resource = report.resources.find((item) => item.id === id || item.relativePath === id);
  if (resource === undefined) {
    throw new DiscoveryError("REPORT", `No resource ${id} in the report`);
  }
  const lines = [
    `id ${resource.id}`,
    `path ${resource.relativePath}`,
    `size ${resource.size}`,
    `kind ${resource.kind}`,
    `signature ${resource.signature.name} ${resource.signature.bytesHex}`,
    `status ${resource.status}`,
    `rankingMethod is on the report: ${report.rankingMethod}`,
    `packEntryExtraction ${resource.packEntryExtraction}`,
    `entryOffset ${resource.entryOffset ?? "unresolved"}`,
    `archive header=${resource.archive?.headerPath ?? "-"} payload=${resource.archive?.payloadPath ?? "-"} manifest=${resource.archive?.manifestPath ?? "-"}`,
    `classificationError ${resource.classificationError ?? "none"}`,
    `uncertainty ${resource.uncertainty}`,
    resource.roles === undefined
      ? "roles none (not Jev-classified)"
      : `roles ${JSON.stringify(resource.roles)}`,
    "samples:",
  ];
  for (const sample of resource.evidence.samples) {
    lines.push(
      `  ${sample.offsetSpace}@${sample.offset} len=${sample.byteLength} ${sample.encoding} ${sample.text}`,
    );
  }
  lines.push("references:");
  for (const reference of resource.evidence.references) {
    lines.push(
      `  @${reference.sourceOffset} ${reference.value}${reference.typeName !== undefined ? `:${reference.typeName}` : ""} ${reference.resolution}${reference.resolvedResourceId !== undefined ? ` -> ${reference.resolvedResourceId}` : ""}`,
    );
  }
  if (resource.evidence.gfx !== undefined) {
    lines.push(`gfx ${JSON.stringify(resource.evidence.gfx)}`);
  }
  if (resource.evidence.notes.length > 0) {
    lines.push(`notes ${resource.evidence.notes.join(" | ")}`);
  }
  return `${lines.join("\n")}\n`;
}
