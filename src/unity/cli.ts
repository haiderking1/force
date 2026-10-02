import path from "node:path";
import type { CliIo, CliWriter } from "../cli/io.ts";
import { extractPentiment } from "./games/pentiment/extract.ts";
import { stagePentimentText } from "./games/pentiment/stage.ts";

export const UNITY_USAGE = `Unity commands:
  force unity detect --root GAME
  force unity scan --root GAME --out INVENTORY
  force unity extract --game pentiment --root GAME --out CORPUS
  force unity stage-text --game pentiment --root GAME --corpus CORPUS --translations FILE --out NEW_STAGE
  force unity export --container FILE --asset SERIALIZED_NAME --path-id ID --out DIR
  force unity review --inventory DIR --pattern REGEX --out DIR
  force unity extract-assets --inventory DIR --out DIR
  force unity stage-assets --config PLAN.json --out NEW_STAGE
  force unity stage-font --config FONT.json --glyphs GLYPHS.json --out NEW_STAGE
  force unity stage-catalog --stage DIR --catalog GAME_RELATIVE_CATALOG.json
  force unity merge --stage STAGE_A --stage STAGE_B --catalog GAME_RELATIVE_CATALOG.json --out NEW_STAGE
  force unity apply --stage APPROVED_STAGE --backup NEW_BACKUP --confirm
  force unity restore --backup BACKUP --confirm

Translate the extracted strings.json with force translate --input FILE --out DIR.
All Unity commands are local. Only explicit apply/restore modify installed files.
Serialized files and unencrypted UnityFS bundles use pinned UnityPy tooling.
Opaque MonoBehaviours, custom formats, and runtime Arabic rendering need adapters.
`;

async function forward(stream: ReadableStream<Uint8Array>, writer: CliWriter): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) writer.write(decoder.decode(chunk, { stream: true }));
  writer.write(decoder.decode());
}

export async function runUnityCommand(argv: readonly string[], io: CliIo): Promise<number> {
  if (!argv.length || argv[0] === "--help" || argv[0] === "help") {
    io.stdout.write(UNITY_USAGE);
    return 0;
  }
  if (argv[0] === "stage-text") {
    const options = new Map<string, string>();
    for (let i = 1; i < argv.length; i += 2) {
      const key = argv[i], value = argv[i + 1];
      if (!key || !["--game", "--root", "--corpus", "--translations", "--out"].includes(key) || !value || options.has(key))
        throw new Error("Invalid unity stage-text arguments");
      options.set(key, value);
    }
    const root = options.get("--root"), corpus = options.get("--corpus"), translations = options.get("--translations"), out = options.get("--out");
    if (options.get("--game") !== "pentiment" || !root || !corpus || !translations || !out) throw new Error("stage-text requires an explicit Pentiment corpus, translations, root, and output");
    await stagePentimentText(root, corpus, translations, out);
    io.stdout.write(`Staged logical Arabic tables at ${out}; runtime rendering approval remains required\n`);
    return 0;
  }
  if (argv[0] === "extract") {
    const options = new Map<string, string>();
    for (let i = 1; i < argv.length; i += 2) {
      const key = argv[i], value = argv[i + 1];
      if (!key || !["--game", "--root", "--out"].includes(key) || !value || options.has(key))
        throw new Error("unity extract requires --game pentiment --root GAME --out NEW_DIRECTORY");
      options.set(key, value);
    }
    const root = options.get("--root"), out = options.get("--out");
    if (options.get("--game") !== "pentiment" || !root || !out)
      throw new Error("Only the explicit Pentiment JSON localization adapter is implemented");
    await extractPentiment(root, out);
    io.stdout.write(`Extracted Pentiment string tables into ${out}\n`);
    return 0;
  }
  if (io.signal?.aborted) return 130;
  const root = path.resolve(import.meta.dir, "../..");
  const child = Bun.spawn(["uv", "run", "--project", root, "--locked", "--no-env-file", "python", "-m", "force_unity.cli", ...argv], {
    cwd: root, env: { ...process.env, PYTHONPATH: path.join(root, "scripts/unity") },
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const stop = (): void => { child.kill("SIGTERM"); };
  io.signal?.addEventListener("abort", stop, { once: true });
  if (io.signal?.aborted) stop();
  try {
    await Promise.all([forward(child.stdout, io.stdout), forward(child.stderr, io.stderr)]);
    return await child.exited;
  } finally { io.signal?.removeEventListener("abort", stop); }
}
