import type { SwfTag } from "./swf.ts";
import { SWF_TAG_NAMES } from "./swf.ts";

const LINE_CODE = /[A-Z]{4}[0-9]{3}TEXT/g;
const STAR_LINE_CODE = /\*[A-Z]{4}[0-9]{3}TEXT/g;

export type GfxLineCodeHit = {
  readonly lineCode: string;
  readonly starred: boolean;
  readonly offset: number;
  readonly tagType: number | undefined;
  readonly tagName: string | undefined;
};

export function collectAsciiLineCodes(body: Uint8Array, tags: readonly SwfTag[]): readonly GfxLineCodeHit[] {
  const text = new TextDecoder("latin1").decode(body);
  const hits: GfxLineCodeHit[] = [];
  const seen = new Set<string>();
  for (const regex of [STAR_LINE_CODE, LINE_CODE]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null = regex.exec(text);
    while (match !== null) {
      const raw = match[0];
      const starred = raw.startsWith("*");
      const lineCode = starred ? raw.slice(1) : raw;
      const offset = match.index;
      const key = `${offset}:${lineCode}:${starred ? "1" : "0"}`;
      if (!seen.has(key)) {
        const tag = tags.find((item) => {
          const end = item.offset + item.headerSize + item.length;
          return offset >= item.offset && offset < end;
        });
        hits.push({
          lineCode,
          starred,
          offset,
          tagType: tag?.type,
          tagName: tag === undefined ? undefined : SWF_TAG_NAMES[tag.type] ?? `tag${tag.type}`,
        });
        seen.add(key);
      }
      match = regex.exec(text);
    }
  }
  return hits;
}

export function uniqueStarredLineCodes(hits: readonly GfxLineCodeHit[]): readonly string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!hit.starred || seen.has(hit.lineCode)) {
      continue;
    }
    seen.add(hit.lineCode);
    codes.push(hit.lineCode);
  }
  return codes;
}
