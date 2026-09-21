import { deflateSync } from "node:zlib";
import type { ArchiveCompression } from "../../archive/types.ts";
import { BUDDHA_MAX_STORED, BUDDHA_MAX_UNCOMPRESSED } from "../../archive/buddha/limits.ts";
import { PatchError } from "../errors.ts";

export function storeReplacementPayload(
  bytes: Uint8Array,
  compression: ArchiveCompression,
): Uint8Array {
  if (bytes.length > BUDDHA_MAX_UNCOMPRESSED) {
    throw new PatchError("LIMIT", `Replacement content ${bytes.length} exceeds ${BUDDHA_MAX_UNCOMPRESSED}`);
  }
  if (compression === "unsupported") {
    throw new PatchError("COMPRESSION", "Cannot replace an entry that uses an unimplemented compression flag");
  }
  if (compression === "none") {
    if (bytes.length > BUDDHA_MAX_STORED) {
      throw new PatchError("LIMIT", `Uncompressed replacement ${bytes.length} exceeds ${BUDDHA_MAX_STORED}`);
    }
    return bytes;
  }
  const stored = new Uint8Array(deflateSync(Buffer.from(bytes)));
  if (stored.length > BUDDHA_MAX_STORED) {
    throw new PatchError("LIMIT", `Compressed replacement ${stored.length} exceeds ${BUDDHA_MAX_STORED}`);
  }
  return stored;
}

export function detectPayloadAlignment(
  offsets: readonly number[],
): number {
  const nonzero = offsets.filter((offset) => offset > 0);
  if (nonzero.length === 0) {
    return 1;
  }
  let alignment = nonzero[0] ?? 1;
  for (const offset of nonzero) {
    alignment = gcd(alignment, offset);
  }
  return alignment < 1 ? 1 : alignment;
}

export function alignUp(value: number, alignment: number): number {
  if (alignment <= 1) {
    return value;
  }
  const rem = value % alignment;
  return rem === 0 ? value : value + (alignment - rem);
}

function gcd(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}
