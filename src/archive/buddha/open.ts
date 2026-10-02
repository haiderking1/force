import { stat } from "node:fs/promises";
import type { ArchiveList } from "../types.ts";
import { ArchiveError } from "../errors.ts";
import { readWholeFile } from "../read-range.ts";
import { parseBuddhaEntries } from "./entries.ts";
import { parseBuddhaFileTypes } from "./file-types.ts";
import { parseBuddhaHeader } from "./header.ts";
import { BUDDHA_MAX_HEADER_BYTES } from "./limits.ts";

export const BUDDHA_FORMAT_ID = "buddha-dfpf-v5";

export const BUDDHA_ASSUMPTIONS = [
  "Magic dfpf, big-endian header prefix, 16-byte MSB-packed index records.",
  "Version 5.0 and 5.1 use the Stacking-style index (content 24, name 21, extra content 18, reserved 1, offset 29, stored 23, type 8>>1, compress low nibble).",
  "Decoded size is content + extra content. Verified against every entry of every installed PC Brütal Legend pack (71,095 entries, about 70% of zlib entries use extra content). The reserved bit was always 0; its meaning is unknown and writers preserve it.",
  "Compress flag 4 is stored uncompressed. Flag 8 is zlib. Other flags are reported, not decoded.",
  "Entry names come from the header name table. Hashes are not invented when a name is present.",
  "Provenance: layout checked against PC Brütal Legend .~h bytes. DoubleFineTool StackingFileIndex.cs was a research lead (decompiled, no license). gdkchan/BLPT is a different console bit packing and is not implemented. DoubleFine Explorer MPL-2.0 PCK/PKG parsers are other formats.",
] as const;

export type OpenBuddhaOptions = {
  readonly headerPath: string;
  readonly payloadPath?: string;
};

export async function openBuddhaPack(options: OpenBuddhaOptions): Promise<ArchiveList> {
  const headerRead = await readWholeFile(options.headerPath, BUDDHA_MAX_HEADER_BYTES);
  const header = parseBuddhaHeader(headerRead.bytes);
  const types = parseBuddhaFileTypes(headerRead.bytes, header);
  let payloadSize: number | undefined;
  if (options.payloadPath !== undefined) {
    try {
      payloadSize = (await stat(options.payloadPath)).size;
    } catch (error) {
      const message = error instanceof Error ? error.message : "payload missing";
      throw new ArchiveError("COMPANION", `Payload ${options.payloadPath} is not readable: ${message}`);
    }
  }
  const parsed = parseBuddhaEntries(headerRead.bytes, header, types, payloadSize);
  return {
    format: BUDDHA_FORMAT_ID,
    versionMajor: header.versionMajor,
    versionMinor: header.versionMinor,
    headerPath: options.headerPath,
    payloadPath: options.payloadPath,
    payloadSize,
    types,
    entries: parsed.entries,
    overlaps: parsed.overlaps,
    assumptions: BUDDHA_ASSUMPTIONS,
  };
}
