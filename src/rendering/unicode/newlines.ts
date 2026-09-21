export function lineBreakLength(codepoints: readonly number[], index: number): number {
  const cp = codepoints[index];
  if (cp === 0x000d) {
    return codepoints[index + 1] === 0x000a ? 2 : 1;
  }
  if (cp === 0x000a) {
    return 1;
  }
  return 0;
}

export function lineBreakLengthInString(text: string, index: number, cp: number): number {
  if (cp === 0x000d) {
    return text.codePointAt(index + 1) === 0x000a ? 2 : 1;
  }
  if (cp === 0x000a) {
    return 1;
  }
  return 0;
}
