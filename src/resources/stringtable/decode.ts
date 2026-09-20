import { ArchiveError } from "../../archive/errors.ts";
import { fieldMap, parseBuddhaTextResource, stringField } from "../buddha-text/parse.ts";
import type { BuddhaTextValue } from "../buddha-text/types.ts";

export type StringTableRecord = {
  readonly lineCode: string;
  readonly text: string;
  readonly volumeDb: string | undefined;
  readonly soundCue: string | undefined;
  readonly keyOffset: number;
  readonly textOffset: number | undefined;
};

export type DecodedStringTable = {
  readonly typeName: string;
  readonly records: readonly StringTableRecord[];
};

function objectFields(value: BuddhaTextValue): { readonly typeName: string; readonly fields: readonly import("../buddha-text/types.ts").BuddhaTextField[] } {
  if (value.kind !== "object") {
    throw new ArchiveError("RESOURCE", "StringTable LineCodeData is not an object");
  }
  return value;
}

export function decodeStringTable(bytes: Uint8Array): DecodedStringTable {
  const resource = parseBuddhaTextResource(bytes);
  if (resource.typeName !== "StringTable") {
    throw new ArchiveError("RESOURCE", `Expected StringTable, got ${resource.typeName}`);
  }
  const lineCodeData = fieldMap(resource.fields).get("LineCodeData");
  if (lineCodeData === undefined) {
    throw new ArchiveError("RESOURCE", "StringTable is missing LineCodeData");
  }
  const block = objectFields(lineCodeData);
  const records: StringTableRecord[] = [];
  for (const field of block.fields) {
    if (field.value.kind !== "object") {
      continue;
    }
    const textValue = field.value.fields.find((item) => item.key === "Text")?.value;
    const text = textValue?.kind === "string" ? textValue.value : textValue?.kind === "empty" ? "" : undefined;
    if (text === undefined) {
      continue;
    }
    records.push({
      lineCode: field.key,
      text,
      volumeDb: stringField(field.value.fields, "VolumeDB"),
      soundCue: stringField(field.value.fields, "SoundCue"),
      keyOffset: field.keyOffset,
      textOffset: textValue?.kind === "string" ? textValue.byteOffset : undefined,
    });
  }
  return { typeName: resource.typeName, records };
}
