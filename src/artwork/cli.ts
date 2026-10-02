import path from "node:path";
import type { CliIo, CliWriter } from "../cli/io.ts";

async function forward(stream: ReadableStream<Uint8Array>, writer: CliWriter): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) writer.write(decoder.decode(chunk, { stream: true }));
  writer.write(decoder.decode());
}

export async function runArtworkCommand(argv: readonly string[], io: CliIo): Promise<number> {
  const root = path.resolve(import.meta.dir, "../..");
  if (io.signal?.aborted) return 130;
  const child = Bun.spawn(["uv", "run", "--project", root, "--locked", "--no-env-file",
    "python", path.join(root, "scripts/artwork/engine/cli.py"), ...argv], {
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const stop = (): void => { child.kill("SIGTERM"); };
  io.signal?.addEventListener("abort", stop, { once: true });
  if (io.signal?.aborted) stop();
  try {
    await Promise.all([forward(child.stdout, io.stdout), forward(child.stderr, io.stderr)]);
    return await child.exited;
  } finally {
    io.signal?.removeEventListener("abort", stop);
  }
}
