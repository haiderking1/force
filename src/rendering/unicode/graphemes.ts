const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

export function splitGraphemes(text: string): string[] {
  if (text.length === 0) return [];
  const segments = graphemeSegmenter.segment(text);
  const result: string[] = [];
  for (const s of segments) {
    result.push(s.segment);
  }
  return result;
}

export function graphemeCount(text: string): number {
  if (text.length === 0) return 0;
  let count = 0;
  for (const _ of graphemeSegmenter.segment(text)) {
    count += 1;
  }
  return count;
}
