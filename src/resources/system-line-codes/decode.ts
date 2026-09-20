import { ArchiveError } from "../../archive/errors.ts";
import { fieldMap, parseBuddhaTextResource } from "../buddha-text/parse.ts";

export type SystemLineCodeRecord = {
  readonly slot: number;
  readonly lineCode: string;
  readonly byteOffset: number | undefined;
};

export type DecodedSystemLineCodes = {
  readonly typeName: string;
  readonly records: readonly SystemLineCodeRecord[];
};

export function decodeSystemLineCodes(bytes: Uint8Array): DecodedSystemLineCodes {
  const resource = parseBuddhaTextResource(bytes);
  if (resource.typeName !== "SystemLineCodes") {
    throw new ArchiveError("RESOURCE", `Expected SystemLineCodes, got ${resource.typeName}`);
  }
  const mapping = fieldMap(resource.fields).get("IDMapping");
  if (mapping === undefined || mapping.kind !== "array") {
    throw new ArchiveError("RESOURCE", "SystemLineCodes is missing IDMapping[]");
  }
  const records: SystemLineCodeRecord[] = [];
  mapping.items.forEach((item, slot) => {
    if (item.kind === "string" && item.value.length > 0) {
      records.push({ slot, lineCode: item.value, byteOffset: item.byteOffset });
    }
  });
  return { typeName: resource.typeName, records };
}
