import { PatchError } from "../errors.ts";
import { BitReader, BitWriter, signedBitCountAll } from "./bits.ts";

export type ShapePoint = {
  readonly x: number;
  readonly y: number;
};

export type FontShapeMove = {
  readonly kind: "move";
  readonly x: number;
  readonly y: number;
  readonly fillStyle0?: number;
};

export type FontShapeLine = {
  readonly kind: "line";
  readonly x: number;
  readonly y: number;
};

export type FontShapeCurve = {
  readonly kind: "curve";
  readonly controlX: number;
  readonly controlY: number;
  readonly x: number;
  readonly y: number;
};

export type FontShapeRecord = FontShapeMove | FontShapeLine | FontShapeCurve;

export type FontShape = {
  readonly numFillBits: number;
  readonly numLineBits: number;
  readonly records: readonly FontShapeRecord[];
  readonly bytes: Uint8Array;
};

function edgeBitCount(values: readonly number[]): number {
  const bits = Math.max(2, signedBitCountAll(values));
  if (bits > 17) {
    throw new PatchError("LIMIT", `SHAPE edge delta needs ${bits} bits; SWF edges are limited to 17`);
  }
  return bits;
}

export function parseFontShape(data: Uint8Array, offset: number, length: number): FontShape {
  if (offset < 0 || length < 0 || offset + length > data.length) {
    throw new PatchError("BOUNDS", "Font SHAPE range overruns the tag");
  }
  const bytes = data.subarray(offset, offset + length);
  const reader = new BitReader(bytes, 0);
  const numFillBits = reader.readUB(4);
  const numLineBits = reader.readUB(4);
  const records: FontShapeRecord[] = [];
  let x = 0;
  let y = 0;
  for (;;) {
    const typeFlag = reader.readUB(1);
    if (typeFlag === 0) {
      const stateNewStyles = reader.readUB(1);
      const stateLineStyle = reader.readUB(1);
      const stateFillStyle1 = reader.readUB(1);
      const stateFillStyle0 = reader.readUB(1);
      const stateMoveTo = reader.readUB(1);
      if (
        stateNewStyles === 0 &&
        stateLineStyle === 0 &&
        stateFillStyle1 === 0 &&
        stateFillStyle0 === 0 &&
        stateMoveTo === 0
      ) {
        break;
      }
      if (stateNewStyles !== 0) {
        throw new PatchError("GFX", "Font SHAPE cannot carry new styles");
      }
      if (stateMoveTo !== 0) {
        const moveBits = reader.readUB(5);
        x = reader.readSB(moveBits);
        y = reader.readSB(moveBits);
      }
      let fillStyle0: number | undefined;
      if (stateFillStyle0 !== 0) {
        fillStyle0 = reader.readUB(numFillBits);
      }
      if (stateFillStyle1 !== 0) {
        reader.readUB(numFillBits);
      }
      if (stateLineStyle !== 0) {
        reader.readUB(numLineBits);
      }
      records.push({ kind: "move", x, y, fillStyle0 });
      continue;
    }
    const straightFlag = reader.readUB(1);
    const numBits = reader.readUB(4) + 2;
    if (straightFlag === 1) {
      const general = reader.readUB(1);
      let dx = 0;
      let dy = 0;
      if (general === 1) {
        dx = reader.readSB(numBits);
        dy = reader.readSB(numBits);
      } else {
        const vert = reader.readUB(1);
        if (vert === 1) {
          dy = reader.readSB(numBits);
        } else {
          dx = reader.readSB(numBits);
        }
      }
      x += dx;
      y += dy;
      records.push({ kind: "line", x, y });
      continue;
    }
    const controlDx = reader.readSB(numBits);
    const controlDy = reader.readSB(numBits);
    const anchorDx = reader.readSB(numBits);
    const anchorDy = reader.readSB(numBits);
    const controlX = x + controlDx;
    const controlY = y + controlDy;
    x = controlX + anchorDx;
    y = controlY + anchorDy;
    records.push({ kind: "curve", controlX, controlY, x, y });
  }
  return { numFillBits, numLineBits, records, bytes };
}

function writeStraight(writer: BitWriter, dx: number, dy: number): void {
  writer.writeUB(1, 1);
  writer.writeUB(1, 1);
  const bits = edgeBitCount([dx, dy]);
  writer.writeUB(4, bits - 2);
  if (dx !== 0 && dy !== 0) {
    writer.writeUB(1, 1);
    writer.writeSB(bits, dx);
    writer.writeSB(bits, dy);
    return;
  }
  writer.writeUB(1, 0);
  if (dy !== 0) {
    writer.writeUB(1, 1);
    writer.writeSB(bits, dy);
    return;
  }
  writer.writeUB(1, 0);
  writer.writeSB(bits, dx);
}

function writeCurve(writer: BitWriter, cdx: number, cdy: number, adx: number, ady: number): void {
  writer.writeUB(1, 1);
  writer.writeUB(1, 0);
  const bits = edgeBitCount([cdx, cdy, adx, ady]);
  writer.writeUB(4, bits - 2);
  writer.writeSB(bits, cdx);
  writer.writeSB(bits, cdy);
  writer.writeSB(bits, adx);
  writer.writeSB(bits, ady);
}

export function encodeFontShape(records: readonly FontShapeRecord[]): Uint8Array {
  const writer = new BitWriter();
  writer.writeUB(4, 1);
  writer.writeUB(4, 0);
  let x = 0;
  let y = 0;
  let fillSet = false;
  for (const record of records) {
    if (record.kind === "move") {
      const moveBits = Math.max(signedBitCountAll([record.x, record.y]), 0);
      writer.writeUB(1, 0);
      writer.writeUB(1, 0);
      writer.writeUB(1, 0);
      writer.writeUB(1, 0);
      writer.writeUB(1, fillSet ? 0 : 1);
      writer.writeUB(1, 1);
      writer.writeUB(5, moveBits);
      writer.writeSB(moveBits, record.x);
      writer.writeSB(moveBits, record.y);
      if (!fillSet) {
        writer.writeUB(1, record.fillStyle0 ?? 1);
        fillSet = true;
      }
      x = record.x;
      y = record.y;
      continue;
    }
    if (record.kind === "line") {
      writeStraight(writer, record.x - x, record.y - y);
      x = record.x;
      y = record.y;
      continue;
    }
    writeCurve(writer, record.controlX - x, record.controlY - y, record.x - record.controlX, record.y - record.controlY);
    x = record.x;
    y = record.y;
  }
  writer.writeUB(6, 0);
  return writer.toBytes();
}

export function emptyFontShapeBytes(): Uint8Array {
  return encodeFontShape([]);
}

export function fontShapePoints(shape: FontShape): readonly ShapePoint[] {
  const points: ShapePoint[] = [];
  for (const record of shape.records) {
    if (record.kind === "curve") {
      points.push({ x: record.controlX, y: record.controlY });
    }
    points.push({ x: record.x, y: record.y });
  }
  return points;
}
