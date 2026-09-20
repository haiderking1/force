import { inflateSync } from "node:zlib";
import { ArchiveError } from "../errors.ts";
import type { ArchiveCompression } from "../types.ts";
import { BUDDHA_MAX_UNCOMPRESSED } from "./limits.ts";

export function decompressBuddhaPayload(
  stored: Uint8Array,
  compression: ArchiveCompression,
  contentSize: number,
): Uint8Array {
  if (contentSize > BUDDHA_MAX_UNCOMPRESSED) {
    throw new ArchiveError(
      "LIMIT",
      `Uncompressed size ${contentSize} exceeds ${BUDDHA_MAX_UNCOMPRESSED}`,
    );
  }
  if (compression === "unsupported") {
    throw new ArchiveError("COMPRESSION", "Entry uses an unimplemented compression flag");
  }
  if (compression === "none") {
    if (stored.length !== contentSize) {
      throw new ArchiveError(
        "COMPRESSION",
        `Uncompressed entry stored ${stored.length} bytes, header content size is ${contentSize}`,
      );
    }
    return stored;
  }
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.from(stored), { maxOutputLength: BUDDHA_MAX_UNCOMPRESSED });
  } catch (error) {
    const message = error instanceof Error ? error.message : "zlib inflate failed";
    throw new ArchiveError("COMPRESSION", `zlib inflate failed: ${message}`);
  }
  if (inflated.length !== contentSize) {
    throw new ArchiveError(
      "COMPRESSION",
      `zlib output is ${inflated.length} bytes, header content size is ${contentSize}`,
    );
  }
  return new Uint8Array(inflated);
}
