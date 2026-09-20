import type { RankedResource } from "../report/types.ts";

const MAX_STATE_SAMPLES = 12;
const MAX_STATE_REFERENCES = 20;
const MAX_STATE_CHARS = 160;

function clip(text: string): string {
  const chars = [...text];
  if (chars.length <= MAX_STATE_CHARS) {
    return text;
  }
  return chars.slice(0, MAX_STATE_CHARS).join("");
}

export function hasClassifiableEvidence(resource: RankedResource): boolean {
  return resource.evidence.samples.length > 0 || resource.evidence.references.length > 0;
}

export function buildJevState(resource: RankedResource): Record<string, unknown> {
  return {
    resource: {
      id: resource.id,
      relativePath: resource.relativePath,
      kind: resource.kind,
      size: resource.size,
      signature: resource.signature.name,
      packEntryExtraction: resource.packEntryExtraction,
      archive: resource.archive,
    },
    evidence: {
      samples: resource.evidence.samples.slice(0, MAX_STATE_SAMPLES).map((sample) => ({
        offset: sample.offset,
        offsetSpace: sample.offsetSpace,
        encoding: sample.encoding,
        text: clip(sample.text),
      })),
      references: resource.evidence.references.slice(0, MAX_STATE_REFERENCES).map((reference) => ({
        value: clip(reference.value),
        typeName: reference.typeName,
        sourceOffset: reference.sourceOffset,
        resolution: reference.resolution,
      })),
      notes: resource.evidence.notes,
      gfx: resource.evidence.gfx === undefined
        ? undefined
        : {
            signature: resource.evidence.gfx.signature,
            parseStatus: resource.evidence.gfx.parseStatus,
            detail: resource.evidence.gfx.detail,
          },
    },
  };
}
