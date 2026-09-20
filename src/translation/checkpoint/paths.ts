import path from "node:path";
import { sha256Text } from "../corpus/hash.ts";

export type CheckpointPaths = {
  readonly root: string;
  readonly identity: string;
  readonly sources: string;
  readonly status: string;
  readonly lock: string;
  readonly batchesDir: string;
  readonly failuresDir: string;
  readonly itemsDir: string;
  readonly unresolved: string;
  readonly assembled: string;
};

export function checkpointPaths(outDir: string): CheckpointPaths {
  const root = path.resolve(outDir);
  return {
    root,
    identity: path.join(root, "identity.json"),
    sources: path.join(root, "sources.json"),
    status: path.join(root, "status.json"),
    lock: path.join(root, "lock.json"),
    batchesDir: path.join(root, "batches"),
    failuresDir: path.join(root, "failures"),
    itemsDir: path.join(root, "items"),
    unresolved: path.join(root, "unresolved.json"),
    assembled: path.join(root, "translations.json"),
  };
}

export function batchFileName(batchIndex: number): string {
  return `${String(batchIndex).padStart(6, "0")}.json`;
}

export function isBatchFileName(name: string): boolean {
  return /^\d{6}\.json$/.test(name);
}

export function itemFileName(id: string): string {
  return `${itemFileDigest(id)}.json`;
}

export function isItemFileName(name: string): boolean {
  return /^[a-f0-9]{64}\.json$/.test(name);
}

export function itemFileDigest(id: string): string {
  return sha256Text(id);
}
