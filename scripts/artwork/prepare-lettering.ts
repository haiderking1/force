import { mkdir } from "node:fs/promises";
import path from "node:path";
import { LayoutEngine } from "../../src/rendering/engine.ts";
import { generateSvgPreview } from "../../src/rendering/preview/svg.ts";

const [configPath, output] = process.argv.slice(2);
if (!configPath || !output) throw new Error("Usage: bun scripts/artwork/prepare-lettering.ts CONFIG OUTPUT_DIRECTORY");
const raw: unknown = await Bun.file(configPath).json();
if (typeof raw !== "object" || raw === null || !("font" in raw) || typeof raw.font !== "string" || !("labels" in raw) || !Array.isArray(raw.labels)) throw new Error("Invalid lettering config");
const config = { font: raw.font, labels: raw.labels.map((value: unknown) => {
  if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value.id) || !("text" in value) || typeof value.text !== "string" || !("color" in value) || typeof value.color !== "string") throw new Error("Invalid label");
  return { id: value.id, text: value.text, color: value.color };
}) };
await mkdir(output, { recursive: false });
const { engine, shaper } = LayoutEngine.fromFont(config.font);
async function run(argv: string[]): Promise<void> {
  const child = Bun.spawn(argv, { stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0) throw new Error(argv[0] + " failed");
}
try {
  for (const label of config.labels) {
    const result = engine.layout(label.text, { width: 4000, fontSize: 200, alignment: "left", baseDirection: "rtl" });
    if (result.lines.length !== 1 || result.diagnostics.length) throw new Error("Unexpected label layout: " + label.id);
    const svg = path.join(output, label.id + ".svg");
    const png = path.join(output, label.id + ".png");
    await Bun.write(svg, generateSvgPreview(result, shaper, { backgroundColor: "none", textColor: label.color, padding: 30 }));
    await run(["rsvg-convert", "-o", png, svg]);
    await run(["magick", png, "-trim", "+repage", path.join(output, label.id + "-trimmed.png")]);
    console.log("Prepared outlines: " + label.id);
  }
} finally {
  shaper.destroy();
}
