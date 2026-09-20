import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { payloadPathFromHeader, packStemFromHeader } from "../../archive/companion-path.ts";
import { extractBuddhaEntry } from "../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { isArchiveError } from "../../archive/errors.ts";
import { safeEntryRelativePath } from "../../archive/path-safety.ts";
import { DiscoveryError } from "../errors.ts";
import { getGameAdapter } from "../games/registry.ts";
import { extractPackStrings } from "../archive/strings-extract.ts";
import { listingJson } from "../archive/listing.ts";
import { decodeExtractedText } from "../../resources/text-records.ts";
import type { DiscoverPackExtractArgs, DiscoverPackListArgs, DiscoverPackStringsArgs } from "./parse.ts";

export type PackCommandIo = {
  readonly stdout: { write(text: string): unknown };
};

function defaultListingPath(headerPath: string): string {
  return path.join("out", "archive", "brutal-legend", "listings", `${packStemFromHeader(headerPath)}.json`);
}

function defaultExtractDir(headerPath: string): string {
  return path.join("out", "archive", "brutal-legend", "extracted", packStemFromHeader(headerPath));
}

function defaultStringsDir(): string {
  return path.join("out", "archive", "brutal-legend");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function wrapArchive(error: unknown): never {
  if (error instanceof DiscoveryError) {
    throw error;
  }
  if (isArchiveError(error)) {
    throw new DiscoveryError(error.code, error.message);
  }
  throw error;
}

export async function runDiscoverPackList(args: DiscoverPackListArgs, io: PackCommandIo): Promise<number> {
  try {
    const payload = args.payload ?? payloadPathFromHeader(args.header);
    const list = await openBuddhaPack({ headerPath: args.header, payloadPath: payload });
    const out = args.out ?? defaultListingPath(args.header);
    await writeJson(out, listingJson(list));
    io.stdout.write(`wrote ${out}\n`);
    io.stdout.write(`${list.entries.length} entries, ${list.types.length} types, ${list.overlaps.length} overlaps\n`);
    return 0;
  } catch (error) {
    wrapArchive(error);
  }
}

export async function runDiscoverPackExtract(args: DiscoverPackExtractArgs, io: PackCommandIo): Promise<number> {
  try {
    const payload = args.payload ?? payloadPathFromHeader(args.header);
    const list = await openBuddhaPack({ headerPath: args.header, payloadPath: payload });
    const extracted = await extractBuddhaEntry(list, args.entry);
    const outDir = args.out ?? defaultExtractDir(args.header);
    const relative = safeEntryRelativePath(extracted.entry.name ?? `entry-${extracted.entry.index}`);
    const rawPath = path.join(outDir, `${relative}.bin`);
    const decoded = decodeExtractedText(list, extracted);
    await mkdir(path.dirname(rawPath), { recursive: true });
    if (args.raw || decoded.status === "skipped") {
      await writeFile(rawPath, extracted.bytes);
    }
    if (decoded.status === "decoded") {
      const jsonPath = path.join(outDir, `${relative}.json`);
      await writeJson(jsonPath, decoded.records);
      io.stdout.write(`wrote ${jsonPath}\n`);
    } else {
      io.stdout.write(`wrote ${rawPath} (${decoded.reason})\n`);
    }
    return 0;
  } catch (error) {
    wrapArchive(error);
  }
}

export async function runDiscoverPackStrings(args: DiscoverPackStringsArgs, io: PackCommandIo): Promise<number> {
  try {
    let root = args.root;
    if (root === undefined && args.header === undefined && args.game !== undefined) {
      root = getGameAdapter(args.game).defaultRoot;
    }
    const result = await extractPackStrings({
      root,
      headerPath: args.header,
      payloadPath: args.payload,
      match: args.match,
    });
    const outDir = args.out ?? defaultStringsDir();
    const recordsPath = path.join(outDir, "strings.json");
    const coveragePath = path.join(outDir, "coverage.json");
    await writeJson(recordsPath, result.records);
    await writeJson(coveragePath, result.coverage);
    io.stdout.write(`wrote ${recordsPath}\n`);
    io.stdout.write(`wrote ${coveragePath}\n`);
    io.stdout.write(
      `${result.coverage.recordsWithText} texts / ${result.coverage.recordsWritten} records from ${result.coverage.entriesDecoded} entries in ${result.coverage.packsOpened} packs\n`,
    );
    return 0;
  } catch (error) {
    wrapArchive(error);
  }
}
