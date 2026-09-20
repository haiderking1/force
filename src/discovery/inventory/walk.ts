import { lstat, readdir, readlink, realpath } from "node:fs/promises";
import path from "node:path";
import { DiscoveryError } from "../errors.ts";
import { readBounded } from "../fs/read.ts";
import type { GameAdapter } from "../games/types.ts";
import { shouldSkipEvidence } from "./exclusions.ts";
import { resourceIdFromRelativePath } from "./ids.ts";
import { identifySignature, kindFromPathAndSignature } from "./signatures.ts";
import type { InventoryRecord, WalkExclusion } from "./types.ts";

const SIGNATURE_BYTES = 16;

export type WalkedFile = {
  readonly record: InventoryRecord;
};

export type WalkResult = {
  readonly files: WalkedFile[];
  readonly exclusions: WalkExclusion[];
  readonly filesSeen: number;
};

function isInsideRoot(rootReal: string, candidateReal: string): boolean {
  const relative = path.relative(rootReal, candidateReal);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function walkGameTree(root: string, adapter: GameAdapter): Promise<WalkResult> {
  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreadable root";
    throw new DiscoveryError("SCAN", `Game root is not readable: ${message}`);
  }

  const files: WalkedFile[] = [];
  const exclusions: WalkExclusion[] = [];
  let filesSeen = 0;

  await walkDirectory(rootReal, rootReal, "", adapter, files, exclusions, (count) => {
    filesSeen += count;
  });

  return { files, exclusions, filesSeen };
}

async function walkDirectory(
  rootReal: string,
  directory: string,
  relativeDirectory: string,
  adapter: GameAdapter,
  files: WalkedFile[],
  exclusions: WalkExclusion[],
  markSeen: (count: number) => void,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreadable directory";
    exclusions.push({
      relativePath: relativeDirectory.length === 0 ? "." : relativeDirectory,
      reason: "unreadable",
      detail: message,
    });
    return;
  }

  for (const entry of entries) {
    const relativePath =
      relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
    const fullPath = path.join(directory, entry.name);
    let stat;
    try {
      stat = await lstat(fullPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unreadable path";
      exclusions.push({ relativePath, reason: "unreadable", detail: message });
      continue;
    }

    if (stat.isSymbolicLink()) {
      const escape = await symlinkEscape(rootReal, fullPath, relativePath);
      if (escape !== undefined) {
        exclusions.push(escape);
        continue;
      }
      let targetStat;
      try {
        targetStat = await lstat(await realpath(fullPath));
      } catch (error) {
        const message = error instanceof Error ? error.message : "unreadable symlink target";
        exclusions.push({ relativePath, reason: "unreadable", detail: message });
        continue;
      }
      if (targetStat.isDirectory()) {
        await walkDirectory(rootReal, await realpath(fullPath), relativePath, adapter, files, exclusions, markSeen);
        continue;
      }
      if (targetStat.isFile()) {
        markSeen(1);
        files.push(await inventoryFile(await realpath(fullPath), relativePath, targetStat.size, adapter));
        continue;
      }
      exclusions.push({ relativePath, reason: "not-a-file", detail: "symlink target is not a file or directory" });
      continue;
    }

    if (stat.isDirectory()) {
      await walkDirectory(rootReal, fullPath, relativePath, adapter, files, exclusions, markSeen);
      continue;
    }

    if (!stat.isFile()) {
      exclusions.push({ relativePath, reason: "not-a-file", detail: "not a regular file" });
      continue;
    }

    markSeen(1);
    files.push(await inventoryFile(fullPath, relativePath, stat.size, adapter));
  }
}

async function symlinkEscape(
  rootReal: string,
  fullPath: string,
  relativePath: string,
): Promise<WalkExclusion | undefined> {
  let target: string;
  try {
    const raw = await readlink(fullPath);
    target = path.resolve(path.dirname(fullPath), raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreadable symlink";
    return { relativePath, reason: "unreadable", detail: message };
  }
  let targetReal = target;
  try {
    targetReal = await realpath(target);
  } catch {
    if (!isInsideRoot(rootReal, target)) {
      return {
        relativePath,
        reason: "symlink-escape",
        detail: `symlink target leaves the game root: ${target}`,
      };
    }
    return { relativePath, reason: "unreadable", detail: "symlink target does not exist" };
  }
  if (!isInsideRoot(rootReal, targetReal)) {
    return {
      relativePath,
      reason: "symlink-escape",
      detail: `symlink target leaves the game root: ${targetReal}`,
    };
  }
  return undefined;
}

async function inventoryFile(
  fullPath: string,
  relativePath: string,
  size: number,
  adapter: GameAdapter,
): Promise<WalkedFile> {
  let signatureBytes = new Uint8Array();
  try {
    const head = await readBounded(fullPath, SIGNATURE_BYTES);
    signatureBytes = new Uint8Array(head.bytes);
  } catch {
    signatureBytes = new Uint8Array();
  }
  const signature = identifySignature(signatureBytes);
  const kind = kindFromPathAndSignature(relativePath, signature.name);
  const exclusionReason = shouldSkipEvidence(relativePath, size, adapter);
  return {
    record: {
      id: resourceIdFromRelativePath(relativePath),
      relativePath: resourceIdFromRelativePath(relativePath),
      size,
      kind,
      signature,
      companionIds: [],
      manifestIds: [],
      packFamilyId: undefined,
      excludedFromEvidence: exclusionReason !== undefined,
      exclusionReason,
    },
  };
}
