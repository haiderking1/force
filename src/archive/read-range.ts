import { open } from "node:fs/promises";
import { ArchiveError } from "./errors.ts";

export type RangeRead = {
  readonly bytes: Uint8Array;
  readonly fileSize: number;
};

export async function readFileRange(filePath: string, offset: number, size: number): Promise<RangeRead> {
  if (offset < 0 || size < 0) {
    throw new ArchiveError("RANGE", `Invalid read range offset=${offset} size=${size}`);
  }
  const handle = await open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (offset > stat.size || offset + size > stat.size) {
      throw new ArchiveError(
        "RANGE",
        `Read range ${offset}+${size} exceeds file size ${stat.size} in ${filePath}`,
      );
    }
    const bytes = new Uint8Array(size);
    if (size > 0) {
      const result = await handle.read(bytes, 0, size, offset);
      if (result.bytesRead !== size) {
        throw new ArchiveError(
          "RANGE",
          `Short read at ${offset}: got ${result.bytesRead}, wanted ${size}`,
        );
      }
    }
    return { bytes, fileSize: stat.size };
  } finally {
    await handle.close();
  }
}

export async function readFileInto(filePath: string, target: Uint8Array): Promise<number> {
  const handle = await open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (stat.size > target.length) {
      throw new ArchiveError("LIMIT", `File ${filePath} is ${stat.size} bytes, over the ${target.length} byte target`);
    }
    let filled = 0;
    while (filled < stat.size) {
      const result = await handle.read(target, filled, stat.size - filled, filled);
      if (result.bytesRead === 0) {
        throw new ArchiveError("RANGE", `Short read of ${filePath}: got ${filled}, wanted ${stat.size}`);
      }
      filled += result.bytesRead;
    }
    return stat.size;
  } finally {
    await handle.close();
  }
}

export async function readWholeFile(filePath: string, maxBytes: number): Promise<RangeRead> {
  const handle = await open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (stat.size > maxBytes) {
      throw new ArchiveError(
        "LIMIT",
        `File ${filePath} is ${stat.size} bytes, over the ${maxBytes} byte header limit`,
      );
    }
    const bytes = new Uint8Array(stat.size);
    if (stat.size > 0) {
      const result = await handle.read(bytes, 0, stat.size, 0);
      if (result.bytesRead !== stat.size) {
        throw new ArchiveError("RANGE", `Short read of ${filePath}`);
      }
    }
    return { bytes, fileSize: stat.size };
  } finally {
    await handle.close();
  }
}
