import { PatchError } from "../errors.ts";
import { parseSwfMatrix, type SwfMatrix } from "./matrix.ts";
import { readU16Le } from "./swf.ts";

const HAS_CHARACTER = 0x02;
const HAS_MATRIX = 0x04;

export type PlaceObject3 = {
  readonly flags1: number;
  readonly flags2: number;
  readonly depth: number;
  readonly characterId: number | undefined;
  readonly matrix: SwfMatrix | undefined;
};

export function parsePlaceObject3(data: Uint8Array): PlaceObject3 {
  const flags1 = data[0];
  const flags2 = data[1];
  if (flags1 === undefined || flags2 === undefined || data.length < 4) {
    throw new PatchError("GFX", "PlaceObject3 is shorter than the fixed header");
  }
  let pos = 2;
  const depth = readU16Le(data, pos);
  pos += 2;
  let characterId: number | undefined;
  if ((flags1 & HAS_CHARACTER) !== 0) {
    characterId = readU16Le(data, pos);
    pos += 2;
  }
  let matrix: SwfMatrix | undefined;
  if ((flags1 & HAS_MATRIX) !== 0) {
    matrix = parseSwfMatrix(data, pos);
  }
  return { flags1, flags2, depth, characterId, matrix };
}
