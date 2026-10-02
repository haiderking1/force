export const PERSIAN_GAF = "\u06af";
export const ARABIC_GHAIN = "\u063a";

export type GafSubstitution = {
  readonly id: string;
  readonly count: number;
};

/** Force has no U+06AF. Ghain is the Arabic letter used for this /g/ in Ormagoden. */
export function replacePersianGaf(text: string): { readonly text: string; readonly count: number } {
  let count = 0;
  const next = text.replaceAll(PERSIAN_GAF, () => {
    count += 1;
    return ARABIC_GHAIN;
  });
  return { text: next, count };
}

export function recordGafSubstitution(id: string, text: string, rows: GafSubstitution[]): string {
  const replaced = replacePersianGaf(text);
  if (replaced.count > 0) {
    rows.push({ id, count: replaced.count });
  }
  return replaced.text;
}
