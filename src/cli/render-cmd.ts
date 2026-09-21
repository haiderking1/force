import { existsSync, readFileSync, writeFileSync } from "fs";
import { LayoutEngine } from "../rendering/engine.ts";
import { isRenderingError, RenderingError } from "../rendering/errors.ts";
import { generateHtmlPreview, generateSvgPreview } from "../rendering/preview/svg.ts";
import type { LayoutOptions } from "../rendering/engine.ts";
import type { CliIo } from "./io.ts";

export type RenderCliArgs = {
  readonly command: "render";
  readonly font: string;
  readonly text: string;
  readonly width: number;
  readonly size: number;
  readonly height?: number;
  readonly minimumSize?: number;
  readonly lineGap?: number;
  readonly padding?: number;
  readonly direction?: "ltr" | "rtl";
  readonly alignment?: "left" | "right" | "center";
  readonly placeholderPolicy?:
    | { readonly mode: "fixed-width"; readonly width: number }
    | { readonly mode: "sample-text"; readonly sample: string }
    | { readonly mode: "unresolved-diagnostic"; readonly severity?: "warning" | "error" };
  readonly expandEscapes?: boolean;
  readonly out?: string;
  readonly svgOut?: string;
  readonly htmlOut?: string;
  readonly json: boolean;
  readonly help: boolean;
};

export async function runRenderCommand(args: RenderCliArgs, io: CliIo): Promise<number> {
  if (args.help) {
    io.stdout.write(`Usage: force render --font <path> --text <string> [options]

Options:
  --font <path>             Path to TTF/OTF font (default: assets/fonts/force.ttf)
  --text <text>             Logical text to render
  --input <file>            Read text from file
  --width <pixels>          Target box width (default: 400)
  --size <pixels>           Font size in pixels (default: 24)
  --height <pixels>         Target box height limit
  --minimum-size <pixels>   Minimum font size for automatic fitting
  --line-gap <pixels>       Line gap between consecutive lines
  --padding <pixels>        Horizontal padding
  --direction <ltr|rtl>     Base paragraph direction (default: rtl)
  --align <left|center|right> Text alignment (default: right for RTL, left for LTR)
  --placeholder <policy>    Placeholder policy: "sample:<text>", "fixed:<width>", or "warn"
  --expand-escapes          Interpret literal \\n as real newlines
  --out <file>              Output SVG or JSON file depending on extension
  --svg <file>              Write visual SVG vector preview file
  --html <file>             Write HTML inspection preview file
  --json                    Output structured layout JSON to stdout
  -h, --help                Show this help
`);
    return 0;
  }

  if (!args.text || args.text.length === 0) {
    io.stderr.write("render requires non-empty text (use --text <string> or --input <file>)\n");
    return 1;
  }

  if (!existsSync(args.font)) {
    io.stderr.write(`Font file not found: ${args.font}\n`);
    return 1;
  }

  try {
    const { engine, shaper } = LayoutEngine.fromFont(args.font);

    const layoutOptions: LayoutOptions = {
      width: args.width,
      fontSize: args.size,
      height: args.height,
      minimumSize: args.minimumSize,
      lineGap: args.lineGap,
      padding: args.padding,
      baseDirection: args.direction,
      alignment: args.alignment,
      placeholderPolicy: args.placeholderPolicy,
      expandLiteralEscapes: args.expandEscapes,
    };

    const result = engine.layout(args.text, layoutOptions);

    if (args.json || (!args.out && !args.svgOut && !args.htmlOut)) {
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }

    if (args.svgOut) {
      const svg = generateSvgPreview(result, shaper);
      writeFileSync(args.svgOut, svg, "utf-8");
      io.stdout.write(`Wrote SVG preview to ${args.svgOut}\n`);
    }

    if (args.htmlOut) {
      const html = generateHtmlPreview(result, shaper);
      writeFileSync(args.htmlOut, html, "utf-8");
      io.stdout.write(`Wrote HTML preview to ${args.htmlOut}\n`);
    }

    if (args.out) {
      if (args.out.endsWith(".svg")) {
        const svg = generateSvgPreview(result, shaper);
        writeFileSync(args.out, svg, "utf-8");
        io.stdout.write(`Wrote SVG preview to ${args.out}\n`);
      } else if (args.out.endsWith(".html")) {
        const html = generateHtmlPreview(result, shaper);
        writeFileSync(args.out, html, "utf-8");
        io.stdout.write(`Wrote HTML preview to ${args.out}\n`);
      } else {
        writeFileSync(args.out, JSON.stringify(result, null, 2), "utf-8");
        io.stdout.write(`Wrote layout JSON to ${args.out}\n`);
      }
    }

    return 0;
  } catch (error) {
    if (isRenderingError(error)) {
      io.stderr.write(`Rendering error: [${error.code}] ${error.message}\n`);
      return 1;
    }
    const msg = error instanceof Error ? error.message : String(error);
    io.stderr.write(`Rendering error: ${msg}\n`);
    return 1;
  }
}
