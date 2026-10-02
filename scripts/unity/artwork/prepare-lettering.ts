import { mkdir } from "node:fs/promises";
import path from "node:path";
import { LayoutEngine } from "../../../src/rendering/engine.ts";
import { generateSvgPreview } from "../../../src/rendering/preview/svg.ts";
import { isRecord } from "../../../src/translation/unknown.ts";

const [configPath, output] = process.argv.slice(2);
if (!configPath || !output) throw new Error("Usage: prepare-lettering.ts PLAN.json NEW_OUTPUT");
const config: unknown = await Bun.file(configPath).json();
if (!isRecord(config) || typeof config.font !== "string" || !Array.isArray(config.labels)) throw new Error("Invalid artwork lettering plan");
await mkdir(output, { recursive: false });
const { engine, shaper } = LayoutEngine.fromFont(config.font);
try {
  for (const label of config.labels) {
    if (!isRecord(label) || typeof label.id !== "string" || !/^[a-z0-9-]+$/.test(label.id)
      || typeof label.text !== "string" || typeof label.width !== "number" || typeof label.height !== "number"
      || typeof label.size !== "number" || typeof label.color !== "string") throw new Error("Invalid artwork label");
    const layout = engine.layout(label.text, { width: label.width, height: label.height, fontSize: label.size,
      minimumSize: Math.floor(label.size / 2), alignment: "center", baseDirection: "rtl" });
    if (layout.diagnostics.length) throw new Error(`Artwork label has unresolved syntax: ${label.id}`);
    const svg = path.join(output, `${label.id}.svg`), png = path.join(output, `${label.id}.png`);
    await Bun.write(svg, generateSvgPreview(layout, shaper, { backgroundColor: "none", textColor: label.color, padding: 10 }));
    const render = Bun.spawn(["rsvg-convert", "-o", png, svg], { stdout: "inherit", stderr: "inherit" });
    if (await render.exited) throw new Error("SVG rasterization failed");
    const trim = Bun.spawn(["magick", png, "-trim", "+repage", path.join(output, `${label.id}-trimmed.png`)], { stdout: "inherit", stderr: "inherit" });
    if (await trim.exited) throw new Error("Lettering trim failed");
  }
} finally { shaper.destroy(); }
