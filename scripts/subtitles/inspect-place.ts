import path from "node:path";
import { resolveBrutalLegendRoot } from "../../src/games/brutal-legend/root.ts";
import { openBuddhaPack } from "../../src/archive/buddha/open.ts";
import { extractBuddhaEntry } from "../../src/archive/buddha/extract.ts";
import { payloadPathFromHeader } from "../../src/archive/companion-path.ts";
import { parseSwfRect } from "../../src/patch/gfx/rect.ts";
import { parseSwfMatrix, type SwfMatrix } from "../../src/patch/gfx/matrix.ts";
import { walkSpriteTags } from "../../src/patch/gfx/sprite-tags.ts";
import { decompressGfx, walkSwfTags, readU16Le } from "../../src/patch/gfx/swf.ts";
import { BRUTAL_LEGEND_GFX_PACK } from "../../src/games/brutal-legend/config.ts";
import { SUBTITLE_ASSET } from "../../src/games/brutal-legend/rendering/subtitle-profile.ts";

const gameRoot = resolveBrutalLegendRoot(process.env, process.argv[2]);
const headerPath = path.join(gameRoot, BRUTAL_LEGEND_GFX_PACK);
const gfx = await openBuddhaPack({ headerPath, payloadPath: path.join(gameRoot, payloadPathFromHeader(BRUTAL_LEGEND_GFX_PACK)) });
const bytes = (await extractBuddhaEntry(gfx, SUBTITLE_ASSET)).bytes;
const body = decompressGfx(bytes).body;
const walk = walkSwfTags(body);

function matrixReport(matrix: SwfMatrix | undefined) {
  if (matrix === undefined) return undefined;
  return {
    hasScale: matrix.hasScale,
    scaleX: matrix.scaleX / 65536,
    scaleY: matrix.scaleY / 65536,
    hasRotate: matrix.hasRotate,
    rotate0: matrix.rotate0 / 65536,
    rotate1: matrix.rotate1 / 65536,
    translateX: matrix.translateX,
    translateY: matrix.translateY,
    translateXPx: matrix.translateX / 20,
    translateYPx: matrix.translateY / 20,
    bytes: matrix.bytes.length,
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
      matrix = parseSwfMatrix(data, pos);
      pos += matrix.bytes.length;
    }
    let name: string | undefined;
    if (hasName) {
      const start = pos;
      while (pos < data.length && data[pos] !== 0) pos += 1;
      name = new TextDecoder("latin1").decode(data.subarray(start, pos));
    }
    return { tagType, flags, depth, hasCharacter, hasMatrix, characterId, matrix: matrixReport(matrix), name };
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
    matrix = parseSwfMatrix(data, pos);
    pos += matrix.bytes.length;
  }
  let name: string | undefined;
  if (hasName) {
    const start = pos;
    while (pos < data.length && data[pos] !== 0) pos += 1;
    name = new TextDecoder("latin1").decode(data.subarray(start, pos));
  }
  return { tagType, flags1, flags2, depth, hasCharacter, hasMatrix, characterId, matrix: matrixReport(matrix), name };
}

const rootPlaces = walk.tags.filter((tag) => tag.type === 26 || tag.type === 70).map((tag) => parsePlaceObject(tag.type, tag.data));
const sprites = walk.tags.filter((tag) => tag.type === 39).map((tag) => {
  const { id, frameCount, tags: inner } = walkSpriteTags(tag.data);
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
