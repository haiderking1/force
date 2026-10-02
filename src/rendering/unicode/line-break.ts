export function isNonBreakingGlue(cp: number): boolean {
  return (
    cp === 0x00a0 || // NO-BREAK SPACE
    cp === 0x202f || // NARROW NO-BREAK SPACE
    cp === 0x2007 || // FIGURE SPACE
    cp === 0x2060 || // WORD JOINER
    cp === 0xfeff    // ZERO WIDTH NO-BREAK SPACE
  );
}

export function isZeroWidthBreak(cp: number): boolean {
  return cp === 0x200b; // ZERO WIDTH SPACE
}

export function isMandatoryBreak(cp: number): boolean {
  return cp === 0x000a || cp === 0x000d || cp === 0x0085 || cp === 0x2028 || cp === 0x2029;
}

export function findBreakOpportunities(text: string): readonly number[] {
  const opportunities: number[] = [];
  if (text.length === 0) return opportunities;

  let prevCp = 0;

  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    if (cp === undefined) break;
    const step = cp > 0xffff ? 2 : 1;

    if (isMandatoryBreak(cp)) {
      opportunities.push(i);
    } else if (cp === 0x0020 || isZeroWidthBreak(cp)) {
      if (!isNonBreakingGlue(prevCp)) {
        opportunities.push(i + step);
      }
    }

    prevCp = cp;
    i += step;
  }

  return opportunities;
}

export function splitIntoBreakTokens(text: string): readonly string[] {
  if (text.length === 0) return [];
  const tokens: string[] = [];
  let current = "";

  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    if (cp === undefined) break;
    const step = cp > 0xffff ? 2 : 1;
    const ch = text.slice(i, i + step);

    if (cp === 0x0020) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else if (isNonBreakingGlue(cp)) {
      current += ch;
    } else {
      current += ch;
    }

    i += step;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
