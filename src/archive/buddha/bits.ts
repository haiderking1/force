export function readMsbBits(
  data: Uint8Array,
  byteOffset: number,
  bitOffset: number,
  length: number,
): number {
  if (bitOffset < 0 || bitOffset > 7 || length < 0 || length > 32) {
    throw new RangeError(`Invalid bit field byte=${byteOffset} bit=${bitOffset} length=${length}`);
  }
  const start = byteOffset * 8 + bitOffset;
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    const bitPosition = start + index;
    const byteIndex = Math.floor(bitPosition / 8);
    const byte = data[byteIndex];
    if (byte === undefined) {
      throw new RangeError(`Bit field overruns buffer at byte ${byteIndex}`);
    }
    const shift = 7 - (bitPosition % 8);
    value = (value << 1) | ((byte >> shift) & 1);
  }
  return value;
}

export function writeMsbBits(
  data: Uint8Array,
  value: number,
  byteOffset: number,
  bitOffset: number,
  length: number,
): void {
  if (bitOffset < 0 || bitOffset > 7 || length < 0 || length > 32) {
    throw new RangeError(`Invalid bit field byte=${byteOffset} bit=${bitOffset} length=${length}`);
  }
  const start = byteOffset * 8 + bitOffset;
  for (let index = 0; index < length; index += 1) {
    const bit = (value >> (length - 1 - index)) & 1;
    const bitPosition = start + index;
    const byteIndex = Math.floor(bitPosition / 8);
    const current = data[byteIndex];
    if (current === undefined) {
      throw new RangeError(`Bit field overruns buffer at byte ${byteIndex}`);
    }
    const shift = 7 - (bitPosition % 8);
    data[byteIndex] = bit === 1 ? current | (1 << shift) : current & ~(1 << shift);
  }
}

export function readU32Be(data: Uint8Array, offset: number): number {
  const b0 = data[offset];
  const b1 = data[offset + 1];
  const b2 = data[offset + 2];
  const b3 = data[offset + 3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) {
    throw new RangeError(`u32be overrun at ${offset}`);
  }
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

export function readU64Be(data: Uint8Array, offset: number): number {
  const high = readU32Be(data, offset);
  const low = readU32Be(data, offset + 4);
  if (high > 0x1fffff) {
    throw new RangeError(`u64be at ${offset} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return high * 0x1_0000_0000 + low;
}

export function writeU32Be(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

export function writeU64Be(data: Uint8Array, offset: number, value: number): void {
  writeU32Be(data, offset, Math.floor(value / 0x1_0000_0000));
  writeU32Be(data, offset + 4, value >>> 0);
}

export function readCString(data: Uint8Array, offset: number, limit: number): string {
  let end = offset;
  const max = Math.min(data.length, offset + limit);
  while (end < max && data[end] !== 0) {
    end += 1;
  }
  return new TextDecoder("ascii").decode(data.subarray(offset, end));
}
