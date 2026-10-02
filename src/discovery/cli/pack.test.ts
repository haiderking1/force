import { afterEach, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCli } from "../../cli/run.ts";
import { buildV5Pack } from "../../archive/buddha/build-v5-pack.ts";
import { createTempDirTracker } from "../../testing/temp-dir.ts";

const tempDirs = createTempDirTracker();
afterEach(() => tempDirs.cleanup());

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write(text: string) { stdout += text; } },
    stderr: { write(text: string) { stderr += text; } },
    read() {
      return { stdout, stderr };
    },
  };
}

function resource(body: string): Uint8Array {
  const encoded = new TextEncoder().encode(body);
  const bytes = new Uint8Array(4 + encoded.length);
  bytes[0] = encoded.length & 0xff;
  bytes[1] = (encoded.length >> 8) & 0xff;
  bytes[2] = (encoded.length >> 16) & 0xff;
  bytes[3] = (encoded.length >> 24) & 0xff;
  bytes.set(encoded, 4);
  return bytes;
}

test("discover pack list and extract write archive JSON without calling fetch", async () => {
  const dir = await tempDirs.create("force-pack-cli-");
  const table = resource(
    '1StringTable{LineCodeData={MENU001TEXT=LineCodeData{Text="Continue";VolumeDB=0;SoundCue=;};};}',
  );
  const pack = buildV5Pack(
    [{ name: "StringTable" }],
    [{ name: "stringtable/test_enus", typeIndex: 0, bytes: table, compress: true }],
  );
  const header = path.join(dir, "Loc.~h");
  const payload = path.join(dir, "Loc.~p");
  await writeFile(header, pack.header);
  await writeFile(payload, pack.payload);
  const listingOut = path.join(dir, "listing.json");
  const io = capture();
  let calls = 0;
  const listCode = await runCli(["discover", "pack", "list", "--header", header, "--out", listingOut], {
    env: {},
    fetch: async () => {
      calls += 1;
      return new Response("no");
    },
    ...io,
  });
  expect(listCode).toBe(0);
  expect(calls).toBe(0);
  const listing = JSON.parse(await readFile(listingOut, "utf8")) as { entryCount: number; entries: { identifier: string }[] };
  expect(listing.entryCount).toBe(1);
  expect(listing.entries[0]?.identifier).toBe("stringtable/test_enus");

  const extractDir = path.join(dir, "extracted");
  const extractCode = await runCli(
    ["discover", "pack", "extract", "--header", header, "--entry", "stringtable/test_enus", "--out", extractDir],
    { env: {}, fetch: async () => { calls += 1; return new Response("no"); }, ...io },
  );
  expect(extractCode).toBe(0);
  expect(calls).toBe(0);
  const records = JSON.parse(await readFile(path.join(extractDir, "stringtable/test_enus.json"), "utf8")) as { recordId: string; text: string }[];
  expect(records).toEqual([
    expect.objectContaining({ recordId: "MENU001TEXT", text: "Continue" }),
  ]);
});

test("discover pack strings joins subtitle line codes to StringTable text", async () => {
  const dir = await tempDirs.create("force-pack-strings-");
  const table = resource(
    '1StringTable{LineCodeData={INTR001GUIT=LineCodeData{Text="Rise and shine.";VolumeDB=0;SoundCue=;};};}',
  );
  const subs = resource("1VidSubtitles{Subtitles=[VidSubtitle{LineCode=INTR001GUIT;StartFrame=10;Length=20;}];}");
  const pack = buildV5Pack(
    [{ name: "StringTable" }, { name: "VidSubtitles" }],
    [
      { name: "stringtable/test_enus", typeIndex: 0, bytes: table, compress: false },
      { name: "gameplay/subtitles/intr1", typeIndex: 1, bytes: subs, compress: false },
    ],
  );
  const header = path.join(dir, "Mix.~h");
  await writeFile(header, pack.header);
  await writeFile(path.join(dir, "Mix.~p"), pack.payload);
  const outDir = path.join(dir, "out");
  const io = capture();
  const code = await runCli(["discover", "pack", "strings", "--header", header, "--out", outDir], {
    env: {},
    ...io,
  });
  expect(code).toBe(0);
  const records = JSON.parse(await readFile(path.join(outDir, "strings.json"), "utf8")) as {
    recordId: string;
    text: string | undefined;
    extra: { resolvedFrom?: string };
  }[];
  const subtitle = records.find((record) => record.recordId === "INTR001GUIT" && record.extra.resolvedFrom !== undefined);
  expect(subtitle?.text).toBe("Rise and shine.");
});
