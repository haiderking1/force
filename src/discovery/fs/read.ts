import { open } from "node:fs/promises";

export type BoundedRead = {
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly truncated: boolean;
};

export async function readBounded(filePath: string, maxBytes: number): Promise<BoundedRead> {
  const handle = await open(filePath, "r");
  try {
    const stat = await handle.stat();
    const size = stat.size;
    const toRead = Math.max(0, Math.min(maxBytes, size));
    const bytes = new Uint8Array(toRead);
    if (toRead > 0) {
      const result = await handle.read(bytes, 0, toRead, 0);
      return {
        bytes: bytes.subarray(0, result.bytesRead),
        size,
        truncated: size > result.bytesRead,
      };
    }
    return { bytes, size, truncated: false };
  } finally {
    await handle.close();
  }
}
