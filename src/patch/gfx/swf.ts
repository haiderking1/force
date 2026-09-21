import { inflateSync } from "node:zlib";
import { PatchError } from "../errors.ts";

export const GFX_SIGNATURES = ["CFX", "GFX", "CWS", "FWS"] as const;

export type GfxSignature = (typeof GFX_SIGNATURES)[number];

export type DecompressedGfx = {
  readonly signature: GfxSignature;
  readonly version: number;
  readonly declaredLength: number;
  readonly fileHeader: Uint8Array;
  readonly body: Uint8Array;
};

export function readU16Le(bytes: Uint8Array, offset: number): number {
  const low = bytes[offset];
  const high = bytes[offset + 1];
  if (low === undefined || high === undefined) {
    throw new PatchError("BOUNDS", `u16le overrun at ${offset}`);
  }
  return low | (high << 8);
}

export function writeU16Le(bytes: Uint8Array, offset: number, value: number): void {
  if (value < 0 || value > 0xffff) {
    throw new PatchError("BOUNDS", `u16le value ${value} is out of range`);
  }
  if (offset + 1 >= bytes.length) {
    throw new PatchError("BOUNDS", `u16le write overrun at ${offset}`);
  }
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

export function writeU32Le(bytes: Uint8Array, offset: number, value: number): void {
  if (value < 0 || value > 0xffffffff) {
    throw new PatchError("BOUNDS", `u32le value ${value} is out of range`);
  }
  if (offset + 3 >= bytes.length) {
    throw new PatchError("BOUNDS", `u32le write overrun at ${offset}`);
  }
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

export function u16LeBytes(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  writeU16Le(bytes, 0, value);
  return bytes;
}

export function u32LeBytes(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  writeU32Le(bytes, 0, value);
  return bytes;
}

export function readI16Le(bytes: Uint8Array, offset: number): number {
  const value = readU16Le(bytes, offset);
  return value > 32767 ? value - 65536 : value;
}

export function i16LeBytes(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < -32768 || value > 32767) {
    throw new PatchError("BOUNDS", `i16le value ${value} is out of range`);
  }
  return u16LeBytes(value & 0xffff);
}

export function readU32Le(bytes: Uint8Array, offset: number): number {
  const a = bytes[offset];
  const b = bytes[offset + 1];
  const c = bytes[offset + 2];
  const d = bytes[offset + 3];
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new PatchError("BOUNDS", `u32le overrun at ${offset}`);
  }
  return (a | (b << 8) | (c << 16) | (d << 24)) >>> 0;
}

export function parseRectSize(bytes: Uint8Array, offset: number): number {
  const first = bytes[offset];
  if (first === undefined) {
    throw new PatchError("BOUNDS", `RECT overrun at ${offset}`);
  }
  const nbits = first >> 3;
  return Math.ceil((5 + nbits * 4) / 8);
}

export function decompressGfx(bytes: Uint8Array): DecompressedGfx {
  if (bytes.length < 8) {
    throw new PatchError("GFX", "GFX/SWF header is shorter than 8 bytes");
  }
  const signature = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0);
  if (signature !== "CFX" && signature !== "GFX" && signature !== "CWS" && signature !== "FWS") {
    throw new PatchError("GFX", `Unsupported GFX signature ${JSON.stringify(signature)}`);
  }
  const version = bytes[3];
  if (version === undefined) {
    throw new PatchError("GFX", "GFX version byte is missing");
  }
  const declaredLength = readU32Le(bytes, 4);
  const fileHeader = bytes.subarray(0, 8);
  if (signature === "CFX" || signature === "CWS") {
    try {
      const body = new Uint8Array(inflateSync(bytes.subarray(8)));
      return { signature, version, declaredLength, fileHeader, body };
    } catch (error) {
      const message = error instanceof Error ? error.message : "inflate failed";
      throw new PatchError("GFX", `GFX zlib inflate failed: ${message}`);
    }
  }
  return { signature, version, declaredLength, fileHeader, body: bytes.subarray(8) };
}

export type SwfTag = {
  readonly type: number;
  readonly offset: number;
  readonly headerSize: number;
  readonly length: number;
  readonly data: Uint8Array;
};

export function walkSwfTags(body: Uint8Array): {
  readonly frameRate: number;
  readonly frameCount: number;
  readonly tags: readonly SwfTag[];
  readonly leftover: number;
} {
  const rectSize = parseRectSize(body, 0);
  if (rectSize + 4 > body.length) {
    throw new PatchError("GFX", "SWF frame header overruns the decompressed body");
  }
  const frameRate = readU16Le(body, rectSize);
  const frameCount = readU16Le(body, rectSize + 2);
  const tags: SwfTag[] = [];
  let pos = rectSize + 4;
  while (pos + 2 <= body.length) {
    const header = readU16Le(body, pos);
    const type = header >> 6;
    let length = header & 0x3f;
    let headerSize = 2;
    if (length === 0x3f) {
      if (pos + 6 > body.length) {
        throw new PatchError("GFX", `Long SWF tag header overruns body at ${pos}`);
      }
      length = readU32Le(body, pos + 2);
      headerSize = 6;
    }
    const dataStart = pos + headerSize;
    if (dataStart + length > body.length) {
      throw new PatchError("GFX", `SWF tag ${type} at ${pos} overruns body`);
    }
    tags.push({
      type,
      offset: pos,
      headerSize,
      length,
      data: body.subarray(dataStart, dataStart + length),
    });
    pos = dataStart + length;
    if (type === 0) {
      break;
    }
  }
  return { frameRate, frameCount, tags, leftover: body.length - pos };
}

export const SWF_TAG_NAMES: Readonly<Record<number, string>> = {
  0: "End",
  1: "ShowFrame",
  2: "DefineShape",
  9: "SetBackgroundColor",
  10: "DefineFont",
  11: "DefineText",
  12: "DoAction",
  13: "DefineFontInfo",
  22: "DefineShape2",
  26: "PlaceObject2",
  28: "RemoveObject2",
  32: "DefineShape3",
  33: "DefineText2",
  37: "DefineEditText",
  39: "DefineSprite",
  43: "FrameLabel",
  46: "DefineMorphShape",
  48: "DefineFont2",
  56: "ExportAssets",
  59: "DoInitAction",
  62: "DefineFontInfo2",
  69: "FileAttributes",
  70: "PlaceObject3",
  71: "ImportAssets2",
  73: "DefineFontAlignZones",
  74: "CSMTextSettings",
  75: "DefineFont3",
  76: "SymbolClass",
  82: "DoABC",
  83: "DefineShape4",
  88: "DefineFontName",
  91: "DefineFont4",
  1000: "GfxExporterInfo",
  1001: "GfxDefineExternalImage",
};
