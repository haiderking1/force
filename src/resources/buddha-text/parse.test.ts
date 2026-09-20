import { expect, test } from "bun:test";
import { decodeJournalEntries } from "../journal/decode.ts";
import { decodeStringTable } from "../stringtable/decode.ts";
import { decodeStory } from "../story/decode.ts";
import { decodeSystemLineCodes } from "../system-line-codes/decode.ts";
import { decodeVidSubtitles } from "../subtitles/decode.ts";
import { parseBuddhaTextResource } from "./parse.ts";

function resource(body: string): Uint8Array {
  const encoded = new TextEncoder().encode(body);
  const bytes = new Uint8Array(4 + encoded.length);
  bytes[0] = encoded.length & 0xff;
  bytes[1] = (encoded.length >> 8) & 0xff;
  bytes[2] = (encoded.length >> 16) & 0xff;
  bytes[3] = (encoded.length >> 24) & 0xff;
  bytes.set(encoded, 4);
  return bytes;
}

test("parses StringTable records including quoted UTF-8 and empty fields", () => {
  const bytes = resource(
    '1StringTable{LineCodeData={ULCA001TEXT=LineCodeData{Text="%i of %i pieces unlocked";VolumeDB=0;SoundCue=;};ULCA002TEXT=LineCodeData{Text="Brütal — HAMMER";VolumeDB=0;SoundCue=Voice/Cue;};ULCA003TEXT=LineCodeData{Text=General;VolumeDB=0;SoundCue=;};};}',
  );
  const decoded = decodeStringTable(bytes);
  expect(decoded.records).toHaveLength(3);
  expect(decoded.records[0]?.lineCode).toBe("ULCA001TEXT");
  expect(decoded.records[0]?.text).toBe("%i of %i pieces unlocked");
  expect(decoded.records[1]?.text).toBe("Brütal — HAMMER");
  expect(decoded.records[2]?.text).toBe("General");
  expect(decoded.records[0]?.soundCue).toBe("");
});

test("parses VidSubtitles, Story refs, system slots, and journal line codes", () => {
  const subs = decodeVidSubtitles(
    resource("1VidSubtitles{Subtitles=[VidSubtitle{LineCode=INTR001GUIT;StartFrame=344;Length=240;}];}"),
  );
  expect(subs.records[0]?.lineCode).toBe("INTR001GUIT");
  expect(subs.records[0]?.startFrame).toBe("344");

  const story = decodeStory(
    resource(
      "1Story{Languages=[LanguageData{AudioProjects=[BrutalLegend_USEnglish];StringTables=[@stringtable/brutallegend_enus];LocalizedLanguageCode=PMTE090TEXT;VideoSoundIndex=0;}];StoryName=;}",
    ),
  );
  expect(story.languages[0]?.stringTables).toEqual(["stringtable/brutallegend_enus"]);

  const system = decodeSystemLineCodes(resource("1SystemLineCodes{IDMapping=[TOGU053TEXT,,PMTE123TEXT];}"));
  expect(system.records.map((record) => record.lineCode)).toEqual(["TOGU053TEXT", "PMTE123TEXT"]);
  expect(system.records[1]?.slot).toBe(2);

  const journal = decodeJournalEntries(
    resource("1JournalEntries{Entries=[JournalEntry{Path=unit/headbanger;Name=*ENTE001TEXT;Desc=*ENTE002TEXT;}];}"),
  );
  expect(journal.records[0]?.nameLineCode).toBe("ENTE001TEXT");
  expect(journal.records[0]?.path).toBe("unit/headbanger");
});

test("allows a trailing NUL after the closing brace", () => {
  const encoded = new TextEncoder().encode("1Blob{Name=x;}");
  const bytes = new Uint8Array(5 + encoded.length);
  const size = encoded.length + 1;
  bytes[0] = size & 0xff;
  bytes[1] = (size >> 8) & 0xff;
  bytes.set(encoded, 4);
  bytes[4 + encoded.length] = 0;
  const parsed = parseBuddhaTextResource(bytes);
  expect(parsed.typeName).toBe("Blob");
});

test("rejects a size prefix that does not match the body", () => {
  const bytes = resource("1Blob{Name=x;}");
  bytes[0] = 1;
  expect(() => parseBuddhaTextResource(bytes)).toThrow(/size prefix/);
});
