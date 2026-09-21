import type { DefineFont3Tag } from "../gfx/font3/types.ts";
import { parseFontShape } from "../gfx/shape.ts";
import type { EncodedPuaLabel } from "./pua-labels.ts";

function shapeToSvgPath(shapeBytes: Uint8Array): string {
  const shape = parseFontShape(shapeBytes, 0, shapeBytes.length);
  let d = "";
  for (const record of shape.records) {
    if (record.kind === "move") {
      d += `M ${record.x} ${record.y} `;
    } else if (record.kind === "line") {
      d += `L ${record.x} ${record.y} `;
    } else {
      d += `Q ${record.controlX} ${record.controlY} ${record.x} ${record.y} `;
    }
  }
  if (d.length > 0) {
    d += "Z";
  }
  return d.trim();
}

export function font3GlyphPreviewSvg(
  font: DefineFont3Tag,
  labels: readonly EncodedPuaLabel[],
): string {
  const byCode = new Map(font.glyphs.map((glyph) => [glyph.code, glyph]));
  const cards: string[] = [];
  let y = 40;
  const width = 1200;
  for (const label of labels) {
    let x = 40;
    cards.push(`<text x="40" y="${y - 12}" fill="#c9d1d9" font-size="14">${escapeXml(label.id)} ${escapeXml(label.logical)}</text>`);
    for (const unit of label.units) {
      const glyph = byCode.get(unit.code);
      if (glyph === undefined) {
        continue;
      }
      const path = shapeToSvgPath(glyph.shapeBytes);
      const scale = 0.012;
      cards.push(
        `<g transform="translate(${x}, ${y + 80}) scale(${scale}, ${scale})"><path d="${path}" fill="#e6edf3"/></g>`,
      );
      cards.push(
        `<text x="${x}" y="${y + 110}" fill="#8b949e" font-size="11">U+${unit.code.toString(16).toUpperCase()} adv ${unit.advance}</text>`,
      );
      x += Math.max(80, Math.min(unit.advance * scale + 24, 200));
    }
    y += 150;
  }
  const height = Math.max(y + 20, 200);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0d1117"/>
  ${cards.join("\n  ")}
</svg>
`;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
