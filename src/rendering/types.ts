export type BaseDirection = "ltr" | "rtl";

export type TokenDirection = "ltr" | "rtl" | "spacer";

export type ShapedGlyph = {
  readonly glyphId: number;
  readonly xAdvance: number;
  readonly yAdvance: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly cluster: number;
  readonly flags?: number;
};

export class ShapedText {
  readonly glyphs: readonly ShapedGlyph[];
  readonly signedAdvance: number;

  constructor(glyphs: readonly ShapedGlyph[], signedAdvance: number) {
    this.glyphs = glyphs;
    this.signedAdvance = signedAdvance;
  }

  advance(): number {
    if (!Number.isFinite(this.signedAdvance)) {
      throw new Error("shaped advance is not finite");
    }
    return Math.abs(this.signedAdvance);
  }
}

export type GlyphMetrics = {
  readonly advance: number;
  readonly leftSideBearing: number;
};

export type OutlinePoint = {
  readonly x: number;
  readonly y: number;
};

export type OutlineOp = "move" | "line" | "cubic" | "quad" | "close";

export type OutlineCommand = {
  readonly op: OutlineOp;
  readonly a: OutlinePoint;
  readonly b?: OutlinePoint;
  readonly c?: OutlinePoint;
};

export type OutlineBounds = {
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
  readonly empty: boolean;
};

export type GlyphOutline = {
  readonly commands: readonly OutlineCommand[];
  readonly bounds: OutlineBounds;
};

export type VisualToken = {
  readonly text: string;
  readonly direction: TokenDirection;
};

export type Character = {
  readonly codepoint: number;
  readonly styles: readonly number[];
  readonly reservedAdvance?: number;
  readonly tokenRaw?: string;
};

export type Line = {
  readonly chars: readonly Character[];
  readonly breakStyles: readonly number[];
  readonly newline: boolean;
};

export type Run = {
  readonly text: string;
  readonly styles: readonly number[];
  readonly direction: TokenDirection;
  readonly reservedAdvance?: number;
  readonly tokenRaw?: string;
};

export type EncodedSpan = {
  readonly styles: readonly number[];
  readonly text: string;
};

export type GlyphMapping = {
  readonly token: string;
  readonly direction: TokenDirection;
  readonly codepoint: number;
};

export type Profile = {
  readonly width: number;
  readonly size: number;
  readonly height?: number;
  readonly minimumSize?: number;
  readonly padding?: number;
  readonly lineGap?: number;
};

export type FittedText = {
  readonly spans: readonly EncodedSpan[];
  readonly size: number;
  readonly lines: number;
};

export type PositionedGlyph = {
  readonly glyphId: number;
  readonly x: number;
  readonly y: number;
  readonly xAdvance: number;
  readonly yAdvance: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly cluster: number;
};

export type PositionedLine = {
  readonly lineIndex: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly glyphs: readonly PositionedGlyph[];
  readonly runs: readonly Run[];
  readonly text: string;
};

export type LayoutDiagnostic = {
  readonly level: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly range?: { readonly start: number; readonly end: number };
};

export type LayoutResult = {
  readonly lines: readonly PositionedLine[];
  readonly totalWidth: number;
  readonly totalHeight: number;
  readonly fontSize: number;
  readonly unitsPerEm: number;
  readonly scale: number;
  readonly baseDirection: BaseDirection;
  readonly diagnostics: readonly LayoutDiagnostic[];
};
