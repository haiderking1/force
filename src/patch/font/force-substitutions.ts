import { ARABIC_GHAIN, PERSIAN_GAF } from "./persian-gaf.ts";

export const PERSIAN_PE = "\u067e";
export const ARABIC_BEH = "\u0628";

export type ForceFallback = {
  readonly from: string;
  readonly to: string;
  readonly key: string;
  readonly reason: string;
};

/** Force.ttf has no glyph for these. Each replacement is the readable Arabic or ASCII stand-in. */
export const FORCE_CHAR_FALLBACKS: readonly ForceFallback[] = [
  {
    from: PERSIAN_GAF,
    to: ARABIC_GHAIN,
    key: "persian-gaf",
    reason: "Force has no U+06AF. Ghain is the Arabic letter used for this /g/ in Ormagoden.",
  },
  {
    from: PERSIAN_PE,
    to: ARABIC_BEH,
    key: "persian-pe",
    reason: "Force has no U+067E. Arabic writes /p/ with Beh, as in باكستان.",
  },
  {
    from: "ü",
    to: "u",
    key: "u-diaeresis",
    reason: "Force has no U+00FC. Brütal keeps the base u.",
  },
  {
    from: "ö",
    to: "o",
    key: "o-diaeresis",
    reason: "Force has no U+00F6. Mötley and Ormagöden keep the base o.",
  },
  {
    from: "Ö",
    to: "O",
    key: "O-diaeresis",
    reason: "Force has no U+00D6. ORMAGÖDEN keeps the base O.",
  },
  {
    from: "é",
    to: "e",
    key: "e-acute",
    reason: "Force has no U+00E9. Café keeps the base e.",
  },
];

export type SubstitutionHit = {
  readonly id: string;
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly count: number;
};

export function applyForceSubstitutions(id: string, text: string, hits: SubstitutionHit[]): string {
  let next = text;
  for (const fallback of FORCE_CHAR_FALLBACKS) {
    let count = 0;
    next = next.replaceAll(fallback.from, () => {
      count += 1;
      return fallback.to;
    });
    if (count > 0) {
      hits.push({ id, key: fallback.key, from: fallback.from, to: fallback.to, count });
    }
  }
  return next;
}
