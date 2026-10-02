import { isRecord } from "../../../translation/unknown.ts";

export type PentimentEntry = { readonly ID: number; readonly DefaultText: string };
export type PentimentTable = { readonly Name: string; readonly UObjectName: string; readonly Entries: readonly PentimentEntry[] };
export type PentimentTables = { readonly Hash: number; readonly StringTables: readonly PentimentTable[] };

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value)))
    throw new Error("Unsupported Pentiment string-table schema; refusing to discard unknown fields");
}

export function parsePentimentTables(value: unknown): PentimentTables {
  if (!isRecord(value) || !Number.isSafeInteger(value.Hash) || typeof value.Hash !== "number" || !Array.isArray(value.StringTables))
    throw new Error("Invalid Pentiment string-table bundle");
  exactKeys(value, ["Hash", "StringTables"]);
  const names = new Set<string>();
  const tables: PentimentTable[] = value.StringTables.map(raw => {
    if (!isRecord(raw) || typeof raw.Name !== "string" || !raw.Name || typeof raw.UObjectName !== "string" || !Array.isArray(raw.Entries))
      throw new Error("Invalid Pentiment table");
    exactKeys(raw, ["Name", "UObjectName", "Entries"]);
    if (names.has(raw.Name)) throw new Error(`Duplicate table: ${raw.Name}`);
    names.add(raw.Name);
    const ids = new Set<number>();
    const entries: PentimentEntry[] = raw.Entries.map(entry => {
      if (!isRecord(entry) || typeof entry.ID !== "number" || !Number.isSafeInteger(entry.ID) || typeof entry.DefaultText !== "string")
        throw new Error("Invalid Pentiment entry");
      exactKeys(entry, ["ID", "DefaultText"]);
      if (ids.has(entry.ID)) throw new Error(`Duplicate entry: ${raw.Name}/${entry.ID}`);
      ids.add(entry.ID);
      return { ID: entry.ID, DefaultText: entry.DefaultText };
    });
    return { Name: raw.Name, UObjectName: raw.UObjectName, Entries: entries };
  });
  return { Hash: value.Hash, StringTables: tables };
}

export function stringId(table: string, id: number): string {
  return `pentiment:${encodeURIComponent(table)}:${id}`;
}

export function replacePentimentText(source: PentimentTables, replacements: ReadonlyMap<string, string>): PentimentTables {
  const used = new Set<string>();
  const StringTables = source.StringTables.map(table => ({ ...table, Entries: table.Entries.map(entry => {
    const id = stringId(table.Name, entry.ID);
    const text = replacements.get(id);
    if (text === undefined) return entry;
    used.add(id);
    return { ...entry, DefaultText: text };
  }) }));
  if (used.size !== replacements.size) throw new Error("Replacement contains unknown string IDs");
  return { ...source, StringTables };
}
