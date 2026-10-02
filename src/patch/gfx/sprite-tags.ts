import { PatchError } from "../errors.ts";
import { readU16Le, readU32Le, type SwfTag } from "./swf.ts";

export function walkSpriteTags(data: Uint8Array): { readonly id: number; readonly frameCount: number; readonly tags: readonly SwfTag[] } {
  if (data.length < 4) {
    throw new PatchError("GFX", "DefineSprite is shorter than the id and frame count");
  }
  const id = readU16Le(data, 0);
  const frameCount = readU16Le(data, 2);
  const tags: SwfTag[] = [];
  let pos = 4;
  while (pos + 2 <= data.length) {
    const header = readU16Le(data, pos);
    const type = header >> 6;
    let length = header & 0x3f;
    let headerSize = 2;
    if (length === 0x3f) {
      if (pos + 6 > data.length) {
        throw new PatchError("GFX", `DefineSprite ${id} long tag header overruns the sprite`);
      }
      length = readU32Le(data, pos + 2);
      headerSize = 6;
    }
    const dataStart = pos + headerSize;
    if (dataStart + length > data.length) {
      throw new PatchError("GFX", `DefineSprite ${id} tag ${type} overruns the sprite`);
    }
    tags.push({
      type,
      offset: pos,
      headerSize,
      length,
      data: data.subarray(dataStart, dataStart + length),
    });
    pos = dataStart + length;
    if (type === 0) {
      break;
    }
  }
  return { id, frameCount, tags };
}
