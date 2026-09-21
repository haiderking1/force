import type { GlyphOutline, LayoutResult, PositionedGlyph } from "../types.ts";
import type { Shaper } from "../font/shaper.ts";

export type SvgPreviewOptions = {
  readonly textColor?: string;
  readonly backgroundColor?: string;
  readonly showLineBoxes?: boolean;
  readonly showBaselines?: boolean;
  readonly padding?: number;
};

function outlineToSvgPath(outline: GlyphOutline): string {
  let d = "";
  for (const cmd of outline.commands) {
    if (cmd.op === "move") {
      d += `M ${cmd.a.x} ${cmd.a.y} `;
    } else if (cmd.op === "line") {
      d += `L ${cmd.a.x} ${cmd.a.y} `;
    } else if (cmd.op === "quad") {
      d += `Q ${cmd.a.x} ${cmd.a.y} ${cmd.b?.x ?? 0} ${cmd.b?.y ?? 0} `;
    } else if (cmd.op === "cubic") {
      d += `C ${cmd.a.x} ${cmd.a.y} ${cmd.b?.x ?? 0} ${cmd.b?.y ?? 0} ${cmd.c?.x ?? 0} ${cmd.c?.y ?? 0} `;
    } else if (cmd.op === "close") {
      d += "Z ";
    }
  }
  return d.trim();
}

export function generateSvgPreview(
  layout: LayoutResult,
  shaper: Shaper,
  options: SvgPreviewOptions = {},
): string {
  const textColor = options.textColor ?? "#e6edf3";
  const bgColor = options.backgroundColor ?? "#0d1117";
  const padding = options.padding ?? 24;

  const width = Math.max(layout.totalWidth + padding * 2, 200);
  const height = Math.max(layout.totalHeight + padding * 2, 80);

  // Cache outline path data by glyphId to avoid recalculating
  const pathCache = new Map<number, string>();
  const getPath = (glyphId: number): string => {
    let p = pathCache.get(glyphId);
    if (p === undefined) {
      const outline = shaper.outline(glyphId);
      p = outlineToSvgPath(outline);
      pathCache.set(glyphId, p);
    }
    return p;
  };

  const linesSvg: string[] = [];

  for (const line of layout.lines) {
    const lineX = padding;
    const lineY = padding + line.y;

    if (options.showLineBoxes) {
      linesSvg.push(
        `  <rect x="${lineX}" y="${lineY}" width="${line.width}" height="${line.height}" fill="none" stroke="#30363d" stroke-dasharray="2 2" />`,
      );
    }

    if (options.showBaselines) {
      const baselineY = lineY + line.height * 0.75;
      linesSvg.push(
        `  <line x1="${lineX}" y1="${baselineY}" x2="${lineX + line.width}" y2="${baselineY}" stroke="#e5534b" stroke-width="0.5" stroke-opacity="0.6" />`,
      );
    }

    // Baseline in font coordinates: baseline is positioned around line.height * 0.75
    const baselineY = lineY + line.height * 0.75;

    for (const g of line.glyphs) {
      const pathData = getPath(g.glyphId);
      if (pathData.length === 0) continue;

      const gx = lineX + g.x * layout.scale;
      // In font coordinates: Y+ is up. In SVG: Y+ is down.
      // So y_svg = baselineY - (g.y * scale)
      const gy = baselineY - g.y * layout.scale;

      // Transform applies scale to font units and flips Y
      linesSvg.push(
        `  <path d="${pathData}" transform="translate(${gx.toFixed(2)}, ${gy.toFixed(2)}) scale(${layout.scale.toFixed(6)}, ${(-layout.scale).toFixed(6)})" fill="${textColor}" />`,
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bgColor}" rx="6" />
${linesSvg.join("\n")}
</svg>
`;
}

export function generateHtmlPreview(
  layout: LayoutResult,
  shaper: Shaper,
  options: SvgPreviewOptions = {},
): string {
  const svg = generateSvgPreview(layout, shaper, options);

  const jsonSummary = JSON.stringify(
    {
      fontSize: layout.fontSize,
      unitsPerEm: layout.unitsPerEm,
      scale: layout.scale,
      totalWidth: layout.totalWidth,
      totalHeight: layout.totalHeight,
      lineCount: layout.lines.length,
      lines: layout.lines.map((l) => ({
        index: l.lineIndex,
        text: l.text,
        width: l.width,
        height: l.height,
        glyphCount: l.glyphs.length,
        glyphs: l.glyphs.map((g) => ({
          id: g.glyphId,
          x: Math.round(g.x * layout.scale * 100) / 100,
          y: Math.round(g.y * layout.scale * 100) / 100,
          adv: g.xAdvance,
        })),
      })),
      diagnostics: layout.diagnostics,
    },
    null,
    2,
  );

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>Force Arabic Text Rendering Preview</title>
  <style>
    body {
      background: #0d1117;
      color: #c9d1d9;
      font-family: system-ui, -apple-system, sans-serif;
      margin: 24px;
      direction: ltr;
    }
    h1 { color: #58a6ff; font-size: 20px; }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .preview-container {
      overflow-x: auto;
      margin: 16px 0;
    }
    pre {
      background: #090d13;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 13px;
      color: #7ee787;
    }
  </style>
</head>
<body>
  <h1>Force Arabic Text Rendering Preview</h1>
  <div class="card">
    <h2>Rendered Glyphs (Vector Path Preview)</h2>
    <div class="preview-container">
      ${svg}
    </div>
  </div>
  <div class="card">
    <h2>Layout Inspection Data</h2>
    <pre><code>${jsonSummary}</code></pre>
  </div>
</body>
</html>`;
}
