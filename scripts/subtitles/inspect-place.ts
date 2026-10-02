import path from "node:path";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { payloadPathFromHeader } from "../../src/archive/companion-path.ts";
import { parseSwfRect } from "../../src/patch/gfx/rect.ts";
import { BitReader } from "../../src/patch/gfx/bits.ts";
import { decompressGfx, walkSwfTags, readU16Le, readU32Le, SWF_TAG_NAMES } from "../../src/patch/gfx/swf.ts";
import { BRUTAL_LEGEND_DEFAULT_ROOT, BRUTAL_LEGEND_GFX_PACK } from "../../src/patch/games/brutal-legend/config.ts";
import { SUBTITLE_ASSET } from "../../src/patch/games/brutal-legend/subtitle-profile.ts";

const gameRoot = process.argv[2] ?? BRUTAL_LEGEND_DEFAULT_ROOT;
const headerPath = path.join(gameRoot, BRUTAL_LEGEND_GFX_PACK);
const gfx = await openBuddhaPack({ headerPath, payloadPath: path.join(gameRoot, payloadPathFromHeader(BRUTAL_LEGEND_GFX_PACK)) });
const bytes = (await extractBuddhaEntry(gfx, SUBTITLE_ASSET)).bytes;
const body = decompressGfx(bytes).body;
const walk = walkSwfTags(body);

function walkRawTags(data: Uint8Array): { type: number; offset: number; data: Uint8Array }[] {
  const tags: { type: number; offset: number; data: Uint8Array }[] = [];
  let pos = 0;
  while (pos + 2 <= data.length) {
    const header = readU16Le(data, pos);
    const type = header >> 6;
    let length = header & 0x3f;
    let headerSize = 2;
    if (length === 0x3f) {
      length = readU32Le(data, pos + 2);
      headerSize = 6;
    }
    const start = pos + headerSize;
    tags.push({ type, offset: pos, data: data.subarray(start, start + length) });
    pos = start + length;
    if (type === 0) break;
  }
  return tags;
}

function parseMatrix(data: Uint8Array, offset: number) {
  const reader = new BitReader(data, offset);
  const hasScale = reader.readUB(1) === 1;
  let scaleX = 1;
  let scaleY = 1;
  if (hasScale) {
    const bits = reader.readUB(5);
    scaleX = reader.readSB(bits) / 65536;
    scaleY = reader.readSB(bits) / 65536;
  }
  const hasRotate = reader.readUB(1) === 1;
  let rotate0 = 0;
  let rotate1 = 0;
  if (hasRotate) {
    const bits = reader.readUB(5);
    rotate0 = reader.readSB(bits) / 65536;
    rotate1 = reader.readSB(bits) / 65536;
  }
  const translateBits = reader.readUB(5);
  const translateX = reader.readSB(translateBits);
  const translateY = reader.readSB(translateBits);
  return {
    hasScale,
    scaleX,
    scaleY,
    hasRotate,
    rotate0,
    rotate1,
    translateX,
    translateY,
    translateXPx: translateX / 20,
    translateYPx: translateY / 20,
    bytes: reader.consumedBytes(),
  };
}

function parsePlaceObject(tagType: number, data: Uint8Array) {
  if (tagType === 26) {
    const flags = data[0];
    if (flags === undefined) throw new Error("missing PlaceObject2 flags");
    let pos = 1;
    const depth = readU16Le(data, pos);
    pos += 2;
    const hasCharacter = (flags & 0x02) !== 0;
    const hasMatrix = (flags & 0x04) !== 0;
    const hasName = (flags & 0x20) !== 0;
    let characterId: number | undefined;
    if (hasCharacter) {
      characterId = readU16Le(data, pos);
      pos += 2;
    }
    let matrix;
    if (hasMatrix) {
      matrix = parseMatrix(data, pos);
      pos += matrix.bytes;
    }
    let name: string | undefined;
    if (hasName) {
      const start = pos;
      while (pos < data.length && data[pos] !== 0) pos += 1;
      name = new TextDecoder("latin1").decode(data.subarray(start, pos));
    }
    return { tagType, flags, depth, hasCharacter, hasMatrix, characterId, matrix, name };
  }
  const flags1 = data[0];
  const flags2 = data[1];
  if (flags1 === undefined || flags2 === undefined) throw new Error("missing PlaceObject3 flags");
  let pos = 2;
  const depth = readU16Le(data, pos);
  pos += 2;
  const hasCharacter = (flags1 & 0x02) !== 0;
  const hasMatrix = (flags1 & 0x04) !== 0;
  const hasName = (flags1 & 0x20) !== 0;
  let characterId: number | undefined;
  if (hasCharacter) {
    characterId = readU16Le(data, pos);
    pos += 2;
  }
  let matrix;
  if (hasMatrix) {
    matrix = parseMatrix(data, pos);
    pos += matrix.bytes;
  }
  let name: string | undefined;
  if (hasName) {
    const start = pos;
    while (pos < data.length && data[pos] !== 0) pos += 1;
    name = new TextDecoder("latin1").decode(data.subarray(start, pos));
  }
  return { tagType, flags1, flags2, depth, hasCharacter, hasMatrix, characterId, matrix, name };
}

const rootPlaces = walk.tags.filter((tag) => tag.type === 26 || tag.type === 70).map((tag) => parsePlaceObject(tag.type, tag.data));
const sprites = walk.tags.filter((tag) => tag.type === 39).map((tag) => {
  const id = readU16Le(tag.data, 0);
  const frameCount = readU16Le(tag.data, 2);
  const inner = walkRawTags(tag.data.subarray(4));
  let label = "";
  const events: unknown[] = [];
  for (const item of inner) {
    if (item.type === 43) {
      label = new TextDecoder("latin1").decode(item.data.subarray(0, item.data.indexOf(0)));
    }
    if (item.type === 26 || item.type === 70) {
      events.push({ label, ...parsePlaceObject(item.type, item.data) });
    }
  }
  return { id, frameCount, places: events };
});

const stage = parseSwfRect(body, 0);
console.log(JSON.stringify({
  stage: { xMax: stage.xMax / 20, yMax: stage.yMax / 20 },
  rootPlaces,
  sprites,
}, null, 2));
