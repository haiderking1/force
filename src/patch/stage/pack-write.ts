import { extractBuddhaEntry } from "../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { PatchError } from "../errors.ts";
import { sha256Bytes } from "../hash.ts";
import {
  assertUntouchedEntriesMatch,
  collectUntouchedEntries,
  headerOutsideReplacementFieldsEqual,
  replacedEntryPreservedBits,
} from "../archive/compare.ts";
import { replaceBuddhaEntries, type PackReplaceResult, type ReplacedEntryInfo } from "../archive/replace-entries.ts";

export type StagedPack = {
  readonly result: PackReplaceResult;
  readonly replacements: readonly ReplacedEntryInfo[];
};

export async function stagePackReplacements(options: {
  readonly headerPath: string;
  readonly payloadPath: string;
  readonly replacements: readonly { readonly identifier: string; readonly bytes: Uint8Array }[];
}): Promise<StagedPack> {
  const list = await openBuddhaPack({
    headerPath: options.headerPath,
    payloadPath: options.payloadPath,
  });
  const originalHeader = new Uint8Array(await Bun.file(options.headerPath).arrayBuffer());
  const replacedEntries = options.replacements.map((replacement) => {
    const entry = list.entries.find((item) => item.identifier === replacement.identifier);
    if (entry === undefined) {
      throw new PatchError("ENTRY", `Missing ${replacement.identifier}`);
    }
    return entry;
  });
  // Untouched payload entries are compared against the written stage in assertStagedPackEntries.
  const rebuilt = await replaceBuddhaEntries({
    headerPath: options.headerPath,
    payloadPath: options.payloadPath,
    replacements: options.replacements,
  });
  for (const info of rebuilt.replacements) {
    replacedEntryPreservedBits(
      Uint8Array.from((info.original.recordBytes.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16))),
      Uint8Array.from((info.next.recordBytes.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16))),
    );
  }
  headerOutsideReplacementFieldsEqual(originalHeader, rebuilt.header, replacedEntries);
  return { result: rebuilt, replacements: rebuilt.replacements };
}

export async function assertStagedPackEntries(options: {
  readonly headerPath: string;
  readonly payloadPath: string;
  readonly originalHeaderPath: string;
  readonly originalPayloadPath: string;
  readonly replacements: readonly { readonly identifier: string; readonly bytes: Uint8Array }[];
  readonly rebuilt: PackReplaceResult;
}): Promise<void> {
  const originalList = await openBuddhaPack({
    headerPath: options.originalHeaderPath,
    payloadPath: options.originalPayloadPath,
  });
  const originalHeader = new Uint8Array(await Bun.file(options.originalHeaderPath).arrayBuffer());
  const originalPayload = new Uint8Array(await Bun.file(options.originalPayloadPath).arrayBuffer());
  const replacedIndexes = new Set(
    options.replacements.map((replacement) => {
      const entry = originalList.entries.find((item) => item.identifier === replacement.identifier);
      if (entry === undefined) {
        throw new PatchError("ENTRY", `Missing ${replacement.identifier}`);
      }
      return entry.index;
    }),
  );
  const stagedList = await openBuddhaPack({
    headerPath: options.headerPath,
    payloadPath: options.payloadPath,
  });
  assertUntouchedEntriesMatch(
    collectUntouchedEntries(originalList, originalHeader, originalPayload, replacedIndexes),
    collectUntouchedEntries(stagedList, options.rebuilt.header, options.rebuilt.payload, replacedIndexes),
  );
  for (const replacement of options.replacements) {
    const extracted = await extractBuddhaEntry(stagedList, replacement.identifier);
    if (sha256Bytes(extracted.bytes) !== sha256Bytes(replacement.bytes)) {
      throw new PatchError("ROUNDTRIP", `Staged ${replacement.identifier} content hash does not match the replacement`);
    }
  }
}
