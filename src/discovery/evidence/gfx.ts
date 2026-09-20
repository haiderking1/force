import { inflateSync } from "node:zlib";
import { MAX_INFLATE_BYTES } from "./bounds.ts";
import { extractStringRuns } from "./strings.ts";
import type { GfxMetadata, StringRun } from "./types.ts";

const SIGNATURES = ["CFX", "GFX", "CWS", "FWS", "ZWS"] as const;

type GfxSignature = (typeof SIGNATURES)[number];

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readU32Le(bytes: Uint8Array, offset: number): number | undefined {
  const a = bytes[offset];
  const b = bytes[offset + 1];
  const c = bytes[offset + 2];
  const d = bytes[offset + 3];
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return undefined;
  }
  return a | (b << 8) | (c << 16) | (d << 24);
}

function asSignature(value: string): GfxSignature | undefined {
  for (const signature of SIGNATURES) {
    if (signature === value) {
      return signature;
    }
  }
  return undefined;
}

export type GfxExtraction = {
  readonly metadata: GfxMetadata;
  readonly samples: readonly StringRun[];
};

export function extractGfx(bytes: Uint8Array): GfxExtraction | undefined {
  if (bytes.length < 8) {
    return undefined;
  }
  const signature = asSignature(readAscii(bytes, 0, 3));
  if (signature === undefined) {
    return undefined;
  }
  const version = bytes[3];
  const declaredLength = readU32Le(bytes, 4);
  if (version === undefined || declaredLength === undefined) {
    return undefined;
  }

  if (signature === "ZWS") {
    return {
      metadata: {
        signature,
        version,
        declaredLength,
        compression: "lzma",
        decompressedBytes: undefined,
        frameCount: undefined,
        parseStatus: "unsupported",
        detail: "LZMA-compressed SWF/GFX is not decompressed",
      },
      samples: [],
    };
  }

  const compressed = signature === "CFX" || signature === "CWS";
  if (!compressed) {
    const body = bytes.subarray(8);
    return {
      metadata: {
        signature,
        version,
        declaredLength,
        compression: "none",
        decompressedBytes: body.length,
        frameCount: undefined,
        parseStatus: "header",
        detail: "Uncompressed header parsed. SWF tags are not decoded.",
      },
      samples: extractStringRuns(body, "binary", "file").map((run) => ({
        ...run,
        offset: run.offset + 8,
        offsetSpace: "file" as const,
      })),
    };
  }

  try {
    const inflated = inflateSync(bytes.subarray(8), { maxOutputLength: MAX_INFLATE_BYTES });
    return {
      metadata: {
        signature,
        version,
        declaredLength,
        compression: "zlib",
        decompressedBytes: inflated.byteLength,
        frameCount: undefined,
        parseStatus: "decompressed-sample",
        detail: "Zlib payload inflated with an output bound. SWF tags are not decoded.",
      },
      samples: extractStringRuns(inflated, "binary", "decompressed"),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "inflate failed";
    return {
      metadata: {
        signature,
        version,
        declaredLength,
        compression: "zlib",
        decompressedBytes: undefined,
        frameCount: undefined,
        parseStatus: "opaque",
        detail: `Zlib inflate failed or exceeded the output bound: ${message}`,
      },
      samples: [],
    };
  }
}
