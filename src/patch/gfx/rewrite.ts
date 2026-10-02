import { deflateSync } from "node:zlib";
import { PatchError } from "../errors.ts";
import { decompressGfx, u16LeBytes, u32LeBytes, walkSwfTags, writeU32Le } from "./swf.ts";

export function encodeSwfTag(type: number, data: Uint8Array): Uint8Array {
  if (type < 0 || type > 0x3ff) {
    throw new PatchError("GFX", `SWF tag type ${type} is out of range`);
  }
  if (data.length < 0x3f) {
    const header = u16LeBytes((type << 6) | data.length);
    const out = new Uint8Array(2 + data.length);
    out.set(header, 0);
    out.set(data, 2);
    return out;
  }
  const header = new Uint8Array(6);
  header.set(u16LeBytes((type << 6) | 0x3f), 0);
  header.set(u32LeBytes(data.length), 2);
  const out = new Uint8Array(6 + data.length);
  out.set(header, 0);
  out.set(data, 6);
  return out;
}

export function replaceSwfTagData(body: Uint8Array, replacements: ReadonlyMap<number, Uint8Array>,
  replacementTypes: ReadonlyMap<number, number> = new Map()): Uint8Array {
  const walked = walkSwfTags(body);
  const headerEnd = walked.tags[0]?.offset ?? body.length - walked.leftover;
  const chunks: Uint8Array[] = [body.subarray(0, headerEnd)];
  for (const tag of walked.tags) {
    const nextData = replacements.get(tag.offset);
    if (nextData === undefined) {
      chunks.push(body.subarray(tag.offset, tag.offset + tag.headerSize + tag.length));
      continue;
    }
    chunks.push(encodeSwfTag(replacementTypes.get(tag.offset) ?? tag.type, nextData));
  }
  if (walked.leftover > 0) {
    const leftoverStart = body.length - walked.leftover;
    chunks.push(body.subarray(leftoverStart));
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function rebuildGfxFile(
  original: Uint8Array,
  replacements: ReadonlyMap<number, Uint8Array>,
  replacementTypes: ReadonlyMap<number, number> = new Map(),
): Uint8Array {
  const gfx = decompressGfx(original);
  const nextBody = replaceSwfTagData(gfx.body, replacements, replacementTypes);
  const declaredLength = 8 + nextBody.length;
  if (declaredLength > 0xffffffff) {
    throw new PatchError("LIMIT", `Rewritten GFX length ${declaredLength} exceeds UI32`);
  }
  const header = Uint8Array.from(original.subarray(0, 8));
  writeU32Le(header, 4, declaredLength);
  if (gfx.signature === "CFX" || gfx.signature === "CWS") {
    const compressed = new Uint8Array(deflateSync(Buffer.from(nextBody)));
    const out = new Uint8Array(8 + compressed.length);
    out.set(header, 0);
    out.set(compressed, 8);
    return out;
  }
  const out = new Uint8Array(8 + nextBody.length);
  out.set(header, 0);
  out.set(nextBody, 8);
  return out;
}
