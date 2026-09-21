import { PatchError } from "../errors.ts";

export class BitReader {
  private byteOffset: number;
  private bitOffset: number;
  private readonly start: number;

  constructor(
    private readonly bytes: Uint8Array,
    start = 0,
  ) {
    this.start = start;
    this.byteOffset = start;
    this.bitOffset = 0;
  }

  position(): { readonly byteOffset: number; readonly bitOffset: number } {
    return { byteOffset: this.byteOffset, bitOffset: this.bitOffset };
  }

  consumedBytes(): number {
    const end = this.byteOffset + (this.bitOffset === 0 ? 0 : 1);
    return end - this.start;
  }

  readUB(count: number): number {
    if (count < 0 || count > 32) {
      throw new PatchError("GFX", `Cannot read ${count} unsigned bits`);
    }
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      if (this.byteOffset >= this.bytes.length) {
        throw new PatchError("BOUNDS", "SWF bit reader overran the buffer");
      }
      const byte = this.bytes[this.byteOffset] ?? 0;
      const bit = (byte >> (7 - this.bitOffset)) & 1;
      value = (value << 1) | bit;
      this.bitOffset += 1;
      if (this.bitOffset === 8) {
        this.bitOffset = 0;
        this.byteOffset += 1;
      }
    }
    return value >>> 0;
  }

  readSB(count: number): number {
    if (count === 0) {
      return 0;
    }
    const raw = this.readUB(count);
    const sign = 1 << (count - 1);
    return (raw & sign) !== 0 ? raw - (1 << count) : raw;
  }

  align(): void {
    if (this.bitOffset !== 0) {
      this.bitOffset = 0;
      this.byteOffset += 1;
    }
  }
}

export class BitWriter {
  private readonly bytes: number[] = [];
  private current = 0;
  private bitOffset = 0;

  writeUB(count: number, value: number): void {
    if (count < 0 || count > 32) {
      throw new PatchError("GFX", `Cannot write ${count} unsigned bits`);
    }
    if (count === 0) {
      return;
    }
    const mask = count === 32 ? 0xffffffff : (1 << count) - 1;
    let remaining = value & mask;
    for (let index = count - 1; index >= 0; index -= 1) {
      const bit = (remaining >> index) & 1;
      this.current = (this.current << 1) | bit;
      this.bitOffset += 1;
      if (this.bitOffset === 8) {
        this.bytes.push(this.current & 0xff);
        this.current = 0;
        this.bitOffset = 0;
      }
    }
  }

  writeSB(count: number, value: number): void {
    if (count === 0) {
      if (value !== 0) {
        throw new PatchError("GFX", `Cannot encode ${value} in 0 signed bits`);
      }
      return;
    }
    const min = -(1 << (count - 1));
    const max = (1 << (count - 1)) - 1;
    if (value < min || value > max) {
      throw new PatchError("GFX", `Cannot encode ${value} in ${count} signed bits`);
    }
    this.writeUB(count, value < 0 ? value + (1 << count) : value);
  }

  align(): void {
    if (this.bitOffset !== 0) {
      this.writeUB(8 - this.bitOffset, 0);
    }
  }

  toBytes(): Uint8Array {
    this.align();
    return Uint8Array.from(this.bytes);
  }
}

export function signedBitCount(value: number): number {
  if (!Number.isInteger(value)) {
    throw new PatchError("GFX", `Bit length requires an integer, got ${value}`);
  }
  if (value === 0) {
    return 0;
  }
  let bits = 1;
  while (bits <= 31) {
    const min = -(1 << (bits - 1));
    const max = (1 << (bits - 1)) - 1;
    if (value >= min && value <= max) {
      return bits;
    }
    bits += 1;
  }
  throw new PatchError("GFX", `Value ${value} exceeds 31-bit SWF signed range`);
}

export function signedBitCountAll(values: readonly number[]): number {
  return values.reduce((max, value) => Math.max(max, signedBitCount(value)), 0);
}
