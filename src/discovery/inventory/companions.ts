import type { GameAdapter } from "../games/types.ts";
import { lowercasePath, normalizeRelativePath } from "./ids.ts";
import { extensionOf } from "./exclusions.ts";
import type { InventoryRecord } from "./types.ts";

export type CompanionDraft = {
  readonly id: string;
  readonly relativePath: string;
  readonly kind: InventoryRecord["kind"];
};

export function packStem(relativePath: string, adapter: GameAdapter): string | undefined {
  const lower = lowercasePath(relativePath);
  const slash = lower.lastIndexOf("/");
  const directory = slash === -1 ? "" : lower.slice(0, slash + 1);
  const name = slash === -1 ? lower : lower.slice(slash + 1);
  if (name.endsWith(adapter.headerSuffix.toLowerCase())) {
    return directory + name.slice(0, -adapter.headerSuffix.length);
  }
  if (name.endsWith(adapter.payloadSuffix.toLowerCase())) {
    return directory + name.slice(0, -adapter.payloadSuffix.length);
  }
  for (const suffix of adapter.manifestSuffixes) {
    const lowerSuffix = suffix.toLowerCase();
    if (name.endsWith(lowerSuffix)) {
      return directory + name.slice(0, -lowerSuffix.length);
    }
  }
  return undefined;
}

export function linkCompanions(
  drafts: readonly CompanionDraft[],
  adapter: GameAdapter,
): ReadonlyMap<string, { companionIds: string[]; manifestIds: string[]; packFamilyId: string | undefined }> {
  const groups = new Map<string, CompanionDraft[]>();
  for (const draft of drafts) {
    const stem = packStem(draft.relativePath, adapter);
    if (stem === undefined) {
      continue;
    }
    const existing = groups.get(stem) ?? [];
    existing.push(draft);
    groups.set(stem, existing);
  }

  const links = new Map<string, { companionIds: string[]; manifestIds: string[]; packFamilyId: string | undefined }>();
  for (const draft of drafts) {
    links.set(draft.id, { companionIds: [], manifestIds: [], packFamilyId: undefined });
  }

  for (const [stem, members] of groups) {
    const headers = members.filter((member) => extensionOf(member.relativePath) === adapter.headerSuffix);
    const payloads = members.filter((member) => extensionOf(member.relativePath) === adapter.payloadSuffix);
    if (headers.length === 0 && payloads.length === 0) {
      continue;
    }
    const manifests = members.filter((member) =>
      adapter.manifestSuffixes.includes(extensionOf(member.relativePath)),
    );
    const packIds = [...headers, ...payloads, ...manifests].map((member) => member.id);
    for (const member of [...headers, ...payloads, ...manifests]) {
      const companionIds = packIds.filter((id) => id !== member.id);
      const manifestIds = manifests.map((manifest) => manifest.id);
      links.set(member.id, {
        companionIds: companionIds.map((id) => normalizeRelativePath(id)),
        manifestIds,
        packFamilyId: stem,
      });
    }
  }
  return links;
}
