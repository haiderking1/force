import { PatchError } from "../errors.ts";
import { BitReader, BitWriter, signedBitCountAll } from "./bits.ts";

export type SwfMatrix = {
  readonly hasScale: boolean;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly hasRotate: boolean;
  readonly rotate0: number;
  readonly rotate1: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly bytes: Uint8Array;
};

const FIXED16 = 65536;

export function parseSwfMatrix(data: Uint8Array, offset: number): SwfMatrix {
  const reader = new BitReader(data, offset);
  const hasScale = reader.readUB(1) === 1;
  let scaleX = FIXED16;
  let scaleY = FIXED16;
  if (hasScale) {
    const bits = reader.readUB(5);
    scaleX = reader.readSB(bits);
    scaleY = reader.readSB(bits);
  }
  const hasRotate = reader.readUB(1) === 1;
  let rotate0 = 0;
  let rotate1 = 0;
  if (hasRotate) {
    const bits = reader.readUB(5);
    rotate0 = reader.readSB(bits);
    rotate1 = reader.readSB(bits);
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
    bytes: data.subarray(offset, offset + reader.consumedBytes()),
  };
}

export function encodeSwfMatrix(matrix: {
  readonly hasScale: boolean;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly hasRotate: boolean;
  readonly rotate0: number;
  readonly rotate1: number;
  readonly translateX: number;
  readonly translateY: number;
}): Uint8Array {
  const writer = new BitWriter();
  writer.writeUB(1, matrix.hasScale ? 1 : 0);
  if (matrix.hasScale) {
    const bits = Math.max(1, signedBitCountAll([matrix.scaleX, matrix.scaleY]));
    writer.writeUB(5, bits);
    writer.writeSB(bits, matrix.scaleX);
    writer.writeSB(bits, matrix.scaleY);
  }
  writer.writeUB(1, matrix.hasRotate ? 1 : 0);
  if (matrix.hasRotate) {
    const bits = Math.max(1, signedBitCountAll([matrix.rotate0, matrix.rotate1]));
    writer.writeUB(5, bits);
    writer.writeSB(bits, matrix.rotate0);
    writer.writeSB(bits, matrix.rotate1);
  }
  const translateBits = signedBitCountAll([matrix.translateX, matrix.translateY]);
  if (translateBits > 31) {
    throw new PatchError("GFX", `MATRIX translate nbits ${translateBits} exceeds the SWF 31-bit limit`);
  }
  writer.writeUB(5, translateBits);
  writer.writeSB(translateBits, matrix.translateX);
  writer.writeSB(translateBits, matrix.translateY);
  return writer.toBytes();
}

export function translateMatrix(matrix: SwfMatrix, deltaX: number, deltaY: number): Uint8Array {
  return encodeSwfMatrix({
    hasScale: matrix.hasScale,
    scaleX: matrix.scaleX,
    scaleY: matrix.scaleY,
    hasRotate: matrix.hasRotate,
    rotate0: matrix.rotate0,
    rotate1: matrix.rotate1,
    translateX: matrix.translateX + deltaX,
    translateY: matrix.translateY + deltaY,
  });
}
