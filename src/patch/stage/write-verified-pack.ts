import { writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { payloadPathFromHeader } from "../../archive/companion-path.ts";
import { sha256Bytes } from "../hash.ts";
import { stagePackReplacements, assertStagedPackEntries } from "./pack-write.ts";
import type { EntryReplacement } from "../archive/replace-entries.ts";

export async function writeVerifiedPack(gameRoot: string, out: string, header: string,
  replacements: readonly EntryReplacement[]) {
  const headerPath = path.join(gameRoot, header), payloadPath = payloadPathFromHeader(headerPath);
  const rebuilt = await stagePackReplacements({ headerPath, payloadPath, replacements });
  const stagedHeader = path.join(out, "packs", path.basename(headerPath));
  const stagedPayload = payloadPathFromHeader(stagedHeader);
  await writeFile(stagedHeader, rebuilt.result.header);
  await writeFile(stagedPayload, rebuilt.result.payload);
  await assertStagedPackEntries({ headerPath: stagedHeader, payloadPath: stagedPayload,
    originalHeaderPath: headerPath, originalPayloadPath: payloadPath, replacements, rebuilt: rebuilt.result });
  const files = [];
  for (const item of [
    { relative: header, staged: stagedHeader, bytes: rebuilt.result.header, hash: rebuilt.result.originalHeaderSha256 },
    { relative: payloadPathFromHeader(header), staged: stagedPayload, bytes: rebuilt.result.payload, hash: rebuilt.result.originalPayloadSha256 },
  ]) files.push({ relativePath: item.relative, stagedRelativePath: path.relative(out, item.staged),
    originalSha256: item.hash, originalBytes: (await stat(path.join(gameRoot, item.relative))).size,
    stagedSha256: sha256Bytes(item.bytes), stagedBytes: item.bytes.length });
  return files;
}
