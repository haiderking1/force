import { PatchError } from "../errors.ts";
import { parseSwfMatrix, translateMatrix, type SwfMatrix } from "./matrix.ts";
import { readU16Le } from "./swf.ts";

const HAS_CHARACTER = 0x02;
const HAS_MATRIX = 0x04;
const HAS_COLOR = 0x08;
const HAS_RATIO = 0x10;
const HAS_NAME = 0x20;

export type PlaceObject2 = {
  readonly flags: number;
  readonly depth: number;
  readonly characterId: number | undefined;
  readonly matrix: SwfMatrix | undefined;
  readonly name: string | undefined;
  readonly matrixOffset: number | undefined;
};

function skipColorTransform(data: Uint8Array, offset: number): number {
  const first = data[offset];
  if (first === undefined) {
    throw new PatchError("GFX", "PlaceObject color transform is missing");
  }
  const hasAdd = (first & 0x80) !== 0;
  const hasMult = (first & 0x40) !== 0;
  const nbits = first & 0x0f;
  const fields = (hasMult ? 4 : 0) + (hasAdd ? 4 : 0);
  const bits = 8 + nbits * fields;
  return offset + Math.ceil(bits / 8);
}

function readCString(data: Uint8Array, offset: number): { readonly text: string; readonly end: number } {
  let end = offset;
  while (end < data.length && data[end] !== 0) {
    end += 1;
  }
  if (end >= data.length) {
    throw new PatchError("GFX", `PlaceObject name overruns the tag at ${offset}`);
  }
  return { text: new TextDecoder("latin1").decode(data.subarray(offset, end)), end: end + 1 };
}

export function parsePlaceObject2(data: Uint8Array): PlaceObject2 {
  const flags = data[0];
  if (flags === undefined || data.length < 3) {
    throw new PatchError("GFX", "PlaceObject2 is shorter than the fixed header");
  }
  let pos = 1;
  const depth = readU16Le(data, pos);
  pos += 2;
  let characterId: number | undefined;
  if ((flags & HAS_CHARACTER) !== 0) {
    characterId = readU16Le(data, pos);
    pos += 2;
  }
  let matrix: SwfMatrix | undefined;
  let matrixOffset: number | undefined;
  if ((flags & HAS_MATRIX) !== 0) {
    matrixOffset = pos;
    matrix = parseSwfMatrix(data, pos);
    pos += matrix.bytes.length;
  }
  if ((flags & HAS_COLOR) !== 0) {
    pos = skipColorTransform(data, pos);
  }
  if ((flags & HAS_RATIO) !== 0) {
    pos += 2;
  }
  let name: string | undefined;
  if ((flags & HAS_NAME) !== 0) {
    name = readCString(data, pos).text;
  }
  return { flags, depth, characterId, matrix, name, matrixOffset };
}

export function translatePlaceObject2(
  data: Uint8Array,
  deltaX: number,
  deltaY: number,
): Uint8Array {
  const parsed = parsePlaceObject2(data);
  if (parsed.matrix === undefined || parsed.matrixOffset === undefined) {
    throw new PatchError("GFX", "PlaceObject2 has no matrix to translate");
  }
  const nextMatrix = translateMatrix(parsed.matrix, deltaX, deltaY);
  const before = data.subarray(0, parsed.matrixOffset);
  const after = data.subarray(parsed.matrixOffset + parsed.matrix.bytes.length);
  const out = new Uint8Array(before.length + nextMatrix.length + after.length);
  out.set(before, 0);
  out.set(nextMatrix, before.length);
  out.set(after, before.length + nextMatrix.length);
  return out;
}

export function assertNamedCharacter(
  place: PlaceObject2,
  name: string,
  characterId: number,
): void {
  if (place.name !== name || place.characterId !== characterId || place.matrix === undefined) {
    throw new PatchError(
      "GFX",
      `Expected PlaceObject2 name=${name} character=${characterId}, got name=${place.name} character=${place.characterId}`,
    );
  }
}
