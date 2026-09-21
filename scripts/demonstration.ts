import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { LayoutEngine } from "../src/rendering/engine.ts";
import { generateHtmlPreview, generateSvgPreview } from "../src/rendering/preview/svg.ts";

const FONT_PATH = "assets/fonts/force.ttf";
const OUT_DIR = "out/demonstration";

mkdirSync(OUT_DIR, { recursive: true });

const { engine, shaper } = LayoutEngine.fromFont(FONT_PATH);

const DEMONSTRATION_CASES = [
  {
    id: "dialogue_cutscene",
    title: "Brütal Legend Cutscene Dialogue (Multi-line Arabic with Latin tokens)",
    text: "إيدي ريغز: لقد حان وقت المعركة! جهز غيتار Clementine واضغط /kBI_Attack/ لشن هجوم الفأس المدمر.",
    width: 480,
    fontSize: 24,
    alignment: "right" as const,
  },
  {
    id: "hud_prompt",
    title: "Brütal Legend HUD Prompt with Button Bindings and Numbers",
    text: "النتيجة: %i | اضغط على /bleep/ للقفز أو /Activate/ للتفاعل مع المحرك 4.5.",
    width: 420,
    fontSize: 22,
    alignment: "right" as const,
  },
  {
    id: "mission_brief",
    title: "Brütal Legend Mission Briefing with Paragraphs and Quotation",
    text: "المهمة الأساسية:\nدمر قاعدة الأعداء في وادي الحمم!\n\"لا تستسلم مهما كان الثمن يا بطل.\"",
    width: 400,
    fontSize: 22,
    alignment: "right" as const,
  },
];

console.log(`Running Force Arabic Text-Rendering Pipeline Demonstration...`);

for (const demo of DEMONSTRATION_CASES) {
  const result = engine.layout(demo.text, {
    width: demo.width,
    fontSize: demo.fontSize,
    alignment: demo.alignment,
  });

  const svg = generateSvgPreview(result, shaper, {
    showLineBoxes: true,
    showBaselines: true,
  });

  const html = generateHtmlPreview(result, shaper, {
    showLineBoxes: true,
    showBaselines: true,
  });

  const svgPath = path.join(OUT_DIR, `${demo.id}.svg`);
  const htmlPath = path.join(OUT_DIR, `${demo.id}.html`);
  const jsonPath = path.join(OUT_DIR, `${demo.id}.json`);

  writeFileSync(svgPath, svg, "utf-8");
  writeFileSync(htmlPath, html, "utf-8");
  writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf-8");

  console.log(`- Generated ${demo.id}:`);
  console.log(`  Lines: ${result.lines.length}, Total height: ${result.totalHeight}px`);
  console.log(`  SVG:  ${svgPath} (${svg.length} bytes)`);
  console.log(`  HTML: ${htmlPath} (${html.length} bytes)`);
  console.log(`  JSON: ${jsonPath}`);

  // Validate computed glyph placement
  for (const line of result.lines) {
    if (line.glyphs.length === 0) {
      throw new Error(`Demo ${demo.id} line ${line.lineIndex} has zero glyphs!`);
    }
    for (const g of line.glyphs) {
      if (typeof g.x !== "number" || typeof g.y !== "number" || !Number.isFinite(g.x) || !Number.isFinite(g.y)) {
        throw new Error(`Demo ${demo.id} glyph has non-finite placement coordinates!`);
      }
    }
  }
}

console.log(`\nAll demonstration previews generated and verified successfully in ${OUT_DIR}!`);
