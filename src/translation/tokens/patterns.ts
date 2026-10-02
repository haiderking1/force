const PRINTF =
  /%(?:%|(?:\d+\$)?[-+0#]*(?:\d+|\*)?(?:\.(?:\d+|\*))?(?:hh|h|ll|l|L|z|j|t)?[diuoxXfFeEgGaAcspni])/g;

const BRACE = /\{(?:\/)?(?:[A-Za-z_][A-Za-z0-9_.]*|\d+)(?:=[^\s{}]+|(?:,-?\d+)?(?::[^{}]+)?)?\}/g;

const BRACKET = /\[[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:![A-Za-z0-9_]+)?\]/g;

const MARKUP = /<\/?[A-Za-z][A-Za-z0-9]*(?:(?:\s|=)[^<>]*)?>/g;

const SLASH = /\/[A-Za-z_][A-Za-z0-9_]*\//g;

const UNDERSCORE = /(?<![A-Za-z0-9])_[A-Z][A-Z0-9]+_(?![A-Za-z0-9])/g;

const ESCAPE_FOLLOWERS = new Set(["n", "r", "t", '"', "\\"]);

export function collectPrintfTokens(text: string): string[] {
  return matchAll(text, PRINTF);
}

export function collectBraceTokens(text: string): string[] {
  return matchAll(text, BRACE);
}

export function collectBracketTokens(text: string): string[] {
  return matchAll(text, BRACKET);
}

export function collectMarkupTokens(text: string): string[] {
  return matchAll(text, MARKUP);
}

export function collectUnderscoreTokens(text: string): string[] {
  return matchAll(text, UNDERSCORE);
}

export function collectEscapeTokens(text: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\\") {
      continue;
    }
    const next = text[index + 1];
    if (next === undefined || !ESCAPE_FOLLOWERS.has(next)) {
      continue;
    }
    tokens.push(`\\${next}`);
    index += 1;
  }
  return tokens;
}

export function collectSlashTokens(text: string): string[] {
  const tokens: string[] = [];
  let lastEnd = -1;
  for (const match of text.matchAll(SLASH)) {
    const token = match[0];
    const start = match.index;
    if (start === undefined) {
      continue;
    }
    const chained = start === lastEnd;
    if (!chained && !isBindingSlashOccurrence(text, start, token)) {
      continue;
    }
    tokens.push(token);
    lastEnd = start + token.length;
  }
  return tokens;
}

export function isStructuralSlashToken(token: string): boolean {
  const inner = token.slice(1, -1);
  if (isAlwaysSlashToken(inner)) {
    return true;
  }
  return /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/.test(inner);
}

function isAlwaysSlashToken(inner: string): boolean {
  if (inner === "bleep" || inner.startsWith("kBI_")) {
    return true;
  }
  return /^[A-Z][A-Z0-9_]*$/.test(inner) && inner.length >= 2;
}

function isBindingSlashOccurrence(text: string, start: number, token: string): boolean {
  if (isAlwaysSlashToken(token.slice(1, -1))) {
    return true;
  }
  if (isPathSlashOccurrence(text, start)) {
    return false;
  }
  if (isCreditSlashOccurrence(text, start)) {
    return false;
  }
  return true;
}

function isPathSlashOccurrence(text: string, start: number): boolean {
  if (start === 0) {
    return false;
  }
  const previous = text[start - 1];
  return previous !== undefined && /[A-Za-z0-9]/.test(previous);
}

function isCreditSlashOccurrence(text: string, start: number): boolean {
  if (start < 2 || text[start - 1] !== "/") {
    return false;
  }
  const beforeSlashes = text[start - 2];
  return beforeSlashes !== undefined && /[A-Za-z]/.test(beforeSlashes);
}

function matchAll(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}
