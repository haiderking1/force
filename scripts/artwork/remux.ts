import { replaceBinkiVideo } from "../../src/video/bink/remux.ts";
import { parseBinki } from "../../src/video/bink/container.ts";

const [original, encoded, output] = process.argv.slice(2);
if (!original || !encoded || !output) throw new Error("Usage: bun scripts/artwork/remux.ts ORIGINAL SILENT_VIDEO OUTPUT");
if (await Bun.file(output).exists()) throw new Error("Refusing to overwrite output");
const source = await Bun.file(original).bytes();
const video = await Bun.file(encoded).bytes();
const bytes = replaceBinkiVideo(source, video);
const before = parseBinki(source);
const after = parseBinki(bytes);
for (let i = 0; i < before.frames.length; i++) {
  const a = before.frames[i];
  const b = after.frames[i];
  if (!a || !b || !Buffer.from(a.audio).equals(Buffer.from(b.audio))) throw new Error("Audio packet changed");
}
await Bun.write(output, bytes);
console.log("Remuxed " + after.frames.length + " frames with " + after.audioTracks + " unchanged audio tracks");
