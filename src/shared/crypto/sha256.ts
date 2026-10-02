import { createHash } from "node:crypto";

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Json(value: unknown): string {
  return sha256Text(JSON.stringify(value));
}

export async function sha256File(filePath: string): Promise<string> {
  const hasher = createHash("sha256");
  const file = Bun.file(filePath);
  const stream = file.stream();
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    hasher.update(value);
  }
  return hasher.digest("hex");
}
