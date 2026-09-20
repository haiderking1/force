import type { GameAdapter } from "../games/types.ts";
import { lowercasePath } from "./ids.ts";

export function shouldSkipEvidence(relativePath: string, size: number, adapter: GameAdapter): string | undefined {
  const lower = lowercasePath(relativePath);
  const extension = extensionOf(lower);
  if (adapter.alwaysEvidenceExtensions.includes(extension)) {
    return undefined;
  }
  if (adapter.skipEvidenceExtensions.includes(extension)) {
    return `extension ${extension} is excluded from evidence extraction`;
  }
  if (size > adapter.skipEvidenceMinSize) {
    return `size ${size} exceeds evidence bound ${adapter.skipEvidenceMinSize}`;
  }
  return undefined;
}

export function extensionOf(relativePath: string): string {
  const lower = lowercasePath(relativePath);
  if (lower.endsWith(".~h")) {
    return ".~h";
  }
  if (lower.endsWith(".~p")) {
    return ".~p";
  }
  const slash = lower.lastIndexOf("/");
  const name = slash === -1 ? lower : lower.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return "";
  }
  return name.slice(dot);
}
