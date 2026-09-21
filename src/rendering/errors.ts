export class RenderingError extends Error {
  readonly code: string;

  constructor(message: string, code: string = "RENDERING_ERROR") {
    super(message);
    this.name = "RenderingError";
    this.code = code;
  }
}

export class FontError extends RenderingError {
  constructor(message: string, code: string = "FONT_ERROR") {
    super(message, code);
    this.name = "FontError";
  }
}

export class LayoutOverflowError extends RenderingError {
  constructor(message: string, code: string = "LAYOUT_OVERFLOW") {
    super(message, code);
    this.name = "LayoutOverflowError";
  }
}

export class UnsupportedCharacterError extends RenderingError {
  constructor(message: string, code: string = "UNSUPPORTED_CHARACTER") {
    super(message, code);
    this.name = "UnsupportedCharacterError";
  }
}

export class MissingGlyphError extends RenderingError {
  constructor(message: string, code: string = "MISSING_GLYPH") {
    super(message, code);
    this.name = "MissingGlyphError";
  }
}

export class InvalidProfileError extends RenderingError {
  constructor(message: string, code: string = "INVALID_PROFILE") {
    super(message, code);
    this.name = "InvalidProfileError";
  }
}

export class PuaAllocationError extends RenderingError {
  constructor(message: string, code: string = "PUA_ALLOCATION_ERROR") {
    super(message, code);
    this.name = "PuaAllocationError";
  }
}

export class TokenSyntaxError extends RenderingError {
  constructor(message: string, code: string = "TOKEN_SYNTAX_ERROR") {
    super(message, code);
    this.name = "TokenSyntaxError";
  }
}

export function isRenderingError(error: unknown): error is RenderingError {
  return error instanceof RenderingError;
}
