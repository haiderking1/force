import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Shaper } from "../../src/rendering/font/shaper.ts";
import { UnityGlyphs } from "../../src/unity/text/glyphs.ts";
import { encodeUnityText } from "../../src/unity/text/encode.ts";
import { isRecord } from "../../src/translation/unknown.ts";

const [input, font, output] = process.argv.slice(2);
if (!input || !font || !output) throw new Error("Usage: plan-static-text.ts REQUESTS.json FONT.ttf NEW_OUTPUT");
const source = await readFile(input), fontBytes = await readFile(font);
const requests: unknown = JSON.parse(source.toString("utf8"));
if (!Array.isArray(requests)) throw new Error("Expected explicit per-string layout requests");
const shaper = Shaper.open(fontBytes), glyphs = new UnityGlyphs(shaper);
const encoded: { id: string; logical: string; encoded: string }[] = [];
const blockers: { id: string; error: string }[] = [];
const ids = new Set<string>();
await mkdir(output, { recursive: false });
try {
  for (const request of requests) {
    if (!isRecord(request) || typeof request.id !== "string" || typeof request.text !== "string"
      || typeof request.widthEm !== "number" || typeof request.maxLines !== "number"
      || !Array.isArray(request.pairedTags) || !request.pairedTags.every(tag => typeof tag === "string"))
      throw new Error("Malformed static text request");
    if (ids.has(request.id)) throw new Error("Duplicate request ID");
    ids.add(request.id);
    try {
      const text = encodeUnityText(request.text, glyphs, {
        widthEm: request.widthEm, maxLines: request.maxLines, pairedTags: new Set(request.pairedTags),
      });
      encoded.push({ id: request.id, logical: request.text, encoded: text });
    } catch (error) { blockers.push({ id: request.id, error: error instanceof Error ? error.message : String(error) }); }
  }
  const provenance = { inputSha256: createHash("sha256").update(source).digest("hex"),
    fontSha256: createHash("sha256").update(fontBytes).digest("hex"), inGameVerified: false };
  await writeFile(path.join(output, "glyphs.json"), JSON.stringify({ unitsPerEm: shaper.unitsPerEm(), glyphs: glyphs.glyphs, ...provenance }));
  await writeFile(path.join(output, "encoded.json"), JSON.stringify({ ...provenance, encoded, blockers }, null, 2));
  console.log(`${encoded.length} encoded; ${blockers.length} blocked; ${glyphs.glyphs.length} outlined glyphs`);
  if (blockers.length) process.exitCode = 1;
} finally { shaper.destroy(); }
