import { lowercasePath, normalizeRelativePath } from "../inventory/ids.ts";
import type { InventoryRecord } from "../inventory/types.ts";
import type { TextLine } from "./text-lines.ts";
import type { ObservedReference } from "./types.ts";

const PACKFILE_LINE = /^Packfile\s+(\S+)/;
const ASSET_LINE = /^(\S+):([A-Za-z][A-Za-z0-9]+)\b/;
const KEY_VALUE = /^([A-Za-z][A-Za-z0-9_.]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|(\S+))/;
const MAX_REFERENCES = 200;

function pathIndex(records: readonly InventoryRecord[]): {
  exact: Map<string, string>;
  lower: Map<string, string>;
} {
  const exact = new Map<string, string>();
  const lower = new Map<string, string>();
  for (const record of records) {
    exact.set(normalizeRelativePath(record.relativePath), record.id);
    lower.set(lowercasePath(record.relativePath), record.id);
  }
  return { exact, lower };
}

function resolvePath(
  value: string,
  index: ReturnType<typeof pathIndex>,
  sameDirectory: string,
): Pick<ObservedReference, "resolvedResourceId" | "resolution"> {
  const candidates = [normalizeRelativePath(value), normalizeRelativePath(`${sameDirectory}${value}`)];
  for (const candidate of candidates) {
    const exact = index.exact.get(candidate);
    if (exact !== undefined) {
      return { resolvedResourceId: exact, resolution: "exact-path" };
    }
    const ci = index.lower.get(lowercasePath(candidate));
    if (ci !== undefined) {
      return { resolvedResourceId: ci, resolution: "case-insensitive-path" };
    }
  }
  return { resolvedResourceId: undefined, resolution: "unresolved" };
}

function sourceDirectory(relativePath: string): string {
  const slash = relativePath.lastIndexOf("/");
  return slash === -1 ? "" : relativePath.slice(0, slash + 1);
}

function pushReference(
  found: ObservedReference[],
  seen: Set<string>,
  interesting: readonly string[],
  reference: ObservedReference,
): void {
  const key = `${reference.value}:${reference.typeName ?? ""}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  const typeName = reference.typeName;
  const isInteresting = typeName !== undefined && interesting.some((item) => item.toLowerCase() === typeName.toLowerCase());
  if (isInteresting) {
    found.unshift(reference);
    return;
  }
  found.push(reference);
}

export function extractReferences(
  source: InventoryRecord,
  lines: readonly TextLine[],
  records: readonly InventoryRecord[],
  interesting: readonly string[],
): ObservedReference[] {
  const index = pathIndex(records);
  const directory = sourceDirectory(source.relativePath);
  const found: ObservedReference[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.text.trim();
    const pack = PACKFILE_LINE.exec(trimmed);
    if (pack?.[1] !== undefined) {
      const value = pack[1];
      const resolved = resolvePath(value, index, directory);
      const family =
        resolved.resolvedResourceId === undefined && source.packFamilyId !== undefined
          ? ({ resolvedResourceId: undefined, resolution: "pack-family" } as const)
          : resolved;
      pushReference(found, seen, interesting, {
        value,
        typeName: "Packfile",
        sourceOffset: line.offset,
        resolvedResourceId: resolved.resolvedResourceId,
        resolution: family.resolution === "pack-family" && resolved.resolvedResourceId === undefined
          ? "pack-family"
          : resolved.resolution,
      });
    }
    const asset = ASSET_LINE.exec(trimmed);
    if (asset?.[1] !== undefined) {
      const value = asset[1];
      const typeName = asset[2];
      const resolved = resolvePath(value, index, directory);
      pushReference(found, seen, interesting, {
        value,
        typeName,
        sourceOffset: line.offset,
        resolvedResourceId: resolved.resolvedResourceId,
        resolution: resolved.resolution,
      });
    }
    const kv = KEY_VALUE.exec(trimmed);
    if (kv?.[1] !== undefined) {
      const raw = kv[2] ?? kv[3] ?? kv[4];
      if (raw !== undefined) {
        const resolved = resolvePath(raw, index, directory);
        pushReference(found, seen, interesting, {
          value: `${kv[1]}=${raw}`,
          typeName: kv[1],
          sourceOffset: line.offset,
          resolvedResourceId: resolved.resolvedResourceId,
          resolution: resolved.resolution,
        });
      }
    }
  }

  const interestingFirst = found.filter((item) =>
    item.typeName !== undefined && interesting.some((name) => name.toLowerCase() === item.typeName?.toLowerCase()),
  );
  const rest = found.filter((item) => !interestingFirst.includes(item));
  return [...interestingFirst, ...rest].slice(0, MAX_REFERENCES);
}
