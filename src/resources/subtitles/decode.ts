import { ArchiveError } from "../../archive/errors.ts";
import { fieldMap, parseBuddhaTextResource, stringField } from "../buddha-text/parse.ts";

export type VidSubtitleRecord = {
  readonly lineCode: string;
  readonly startFrame: string | undefined;
  readonly length: string | undefined;
  readonly keyOffset: number;
};

export type DecodedVidSubtitles = {
  readonly typeName: string;
  readonly records: readonly VidSubtitleRecord[];
};

export function decodeVidSubtitles(bytes: Uint8Array): DecodedVidSubtitles {
  const resource = parseBuddhaTextResource(bytes);
  if (resource.typeName !== "VidSubtitles") {
    throw new ArchiveError("RESOURCE", `Expected VidSubtitles, got ${resource.typeName}`);
  }
  const subtitles = fieldMap(resource.fields).get("Subtitles");
  if (subtitles === undefined || subtitles.kind !== "array") {
    throw new ArchiveError("RESOURCE", "VidSubtitles is missing Subtitles[]");
  }
  const records: VidSubtitleRecord[] = [];
  for (const item of subtitles.items) {
    if (item.kind !== "object") {
      continue;
    }
    const lineCode = stringField(item.fields, "LineCode");
    if (lineCode === undefined || lineCode.length === 0) {
      continue;
    }
    const lineField = item.fields.find((field) => field.key === "LineCode");
    records.push({
      lineCode,
      startFrame: stringField(item.fields, "StartFrame"),
      length: stringField(item.fields, "Length"),
      keyOffset: lineField?.keyOffset ?? resource.bodyByteOffset,
    });
  }
  return { typeName: resource.typeName, records };
}
