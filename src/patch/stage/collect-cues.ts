import { extractBuddhaEntry } from "../../archive/buddha/extract.ts";
import type { ArchiveList } from "../../archive/types.ts";
import { decodeVidSubtitles } from "../../resources/subtitles/decode.ts";
import { PatchError } from "../errors.ts";

export type TimedCue = {
  readonly file: string;
  readonly id: string;
};

function subtitlePath(entry: { readonly name: string | undefined; readonly identifier: string }): string {
  return entry.name ?? entry.identifier;
}

export async function collectTimedCues(list: ArchiveList): Promise<readonly TimedCue[]> {
  const files = list.entries.filter((entry) => subtitlePath(entry).startsWith("gameplay/subtitles/"));
  if (files.length === 0) {
    throw new PatchError("VALIDATION", "Man_Trivial has no gameplay/subtitles entries");
  }
  const cues: TimedCue[] = [];
  for (const entry of files) {
    const decoded = decodeVidSubtitles((await extractBuddhaEntry(list, entry.identifier)).bytes);
    for (const record of decoded.records) {
      if (record.lineCode.length === 0) {
        throw new PatchError("VALIDATION", `${entry.identifier} has an empty subtitle LineCode`);
      }
      cues.push({ file: entry.identifier, id: record.lineCode });
    }
  }
  return cues;
}

export function uniqueCueIds(cues: readonly TimedCue[]): readonly string[] {
  return [...new Set(cues.map((cue) => cue.id))].sort();
}
