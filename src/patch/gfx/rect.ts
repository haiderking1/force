import { PatchError } from "../errors.ts";
import { BitReader, BitWriter, signedBitCountAll } from "./bits.ts";

export type SwfRect = {
  readonly nbits: number;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly bytes: Uint8Array;
};

export function parseSwfRect(data: Uint8Array, offset: number): SwfRect {
  if (offset >= data.length) {
    throw new PatchError("BOUNDS", `RECT overrun at ${offset}`);
  }
  const reader = new BitReader(data, offset);
  const nbits = reader.readUB(5);
  const xMin = reader.readSB(nbits);
  const xMax = reader.readSB(nbits);
  const yMin = reader.readSB(nbits);
  const yMax = reader.readSB(nbits);
  const size = reader.consumedBytes();
  return {
    nbits,
    xMin,
    xMax,
    yMin,
    yMax,
    bytes: data.subarray(offset, offset + size),
  };
}

export function encodeSwfRect(xMin: number, xMax: number, yMin: number, yMax: number): Uint8Array {
  const nbits = signedBitCountAll([xMin, xMax, yMin, yMax]);
  if (nbits > 31) {
    throw new PatchError("GFX", `RECT nbits ${nbits} exceeds the SWF 31-bit limit`);
  }
  const writer = new BitWriter();
  writer.writeUB(5, nbits);
  writer.writeSB(nbits, xMin);
  writer.writeSB(nbits, xMax);
  writer.writeSB(nbits, yMin);
  writer.writeSB(nbits, yMax);
  return writer.toBytes();
}

export function emptySwfRectBytes(): Uint8Array {
  return encodeSwfRect(0, 0, 0, 0);
}
