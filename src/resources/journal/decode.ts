import { ArchiveError } from "../../archive/errors.ts";
import { fieldMap, parseBuddhaTextResource, stringField } from "../buddha-text/parse.ts";

export type JournalEntryRecord = {
  readonly path: string | undefined;
  readonly nameLineCode: string | undefined;
  readonly descLineCode: string | undefined;
  readonly keyOffset: number;
};

export type DecodedJournalEntries = {
  readonly typeName: string;
  readonly records: readonly JournalEntryRecord[];
};

function stripLineCodeRef(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value.startsWith("*") ? value.slice(1) : value;
}

export function decodeJournalEntries(bytes: Uint8Array): DecodedJournalEntries {
  const resource = parseBuddhaTextResource(bytes);
  if (resource.typeName !== "JournalEntries") {
    throw new ArchiveError("RESOURCE", `Expected JournalEntries, got ${resource.typeName}`);
  }
  const entries = fieldMap(resource.fields).get("Entries");
  if (entries === undefined || entries.kind !== "array") {
    throw new ArchiveError("RESOURCE", "JournalEntries is missing Entries[]");
  }
  const records: JournalEntryRecord[] = [];
  for (const item of entries.items) {
    if (item.kind !== "object") {
      continue;
    }
    const pathField = item.fields.find((field) => field.key === "Path");
    records.push({
      path: stringField(item.fields, "Path"),
      nameLineCode: stripLineCodeRef(stringField(item.fields, "Name")),
      descLineCode: stripLineCodeRef(stringField(item.fields, "Desc")),
      keyOffset: pathField?.keyOffset ?? resource.bodyByteOffset,
    });
  }
  return { typeName: resource.typeName, records };
}
