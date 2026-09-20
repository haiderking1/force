import { ArchiveError } from "../../archive/errors.ts";
import { fieldMap, parseBuddhaTextResource, stringField } from "../buddha-text/parse.ts";
import type { BuddhaTextValue } from "../buddha-text/types.ts";

export type StoryLanguage = {
  readonly localizedLanguageCode: string | undefined;
  readonly audioProjects: readonly string[];
  readonly stringTables: readonly string[];
  readonly videoSoundIndex: string | undefined;
};

export type DecodedStory = {
  readonly typeName: string;
  readonly storyName: string | undefined;
  readonly languages: readonly StoryLanguage[];
};

function stringsFromArray(value: BuddhaTextValue | undefined): string[] {
  if (value === undefined || value.kind === "empty") {
    return [];
  }
  if (value.kind !== "array") {
    return [];
  }
  const items: string[] = [];
  for (const item of value.items) {
    if (item.kind === "string") {
      items.push(item.value);
    } else if (item.kind === "reference") {
      items.push(item.value);
    }
  }
  return items;
}

export function decodeStory(bytes: Uint8Array): DecodedStory {
  const resource = parseBuddhaTextResource(bytes);
  if (resource.typeName !== "Story") {
    throw new ArchiveError("RESOURCE", `Expected Story, got ${resource.typeName}`);
  }
  const languagesValue = fieldMap(resource.fields).get("Languages");
  if (languagesValue === undefined || languagesValue.kind !== "array") {
    throw new ArchiveError("RESOURCE", "Story is missing Languages[]");
  }
  const languages: StoryLanguage[] = [];
  for (const item of languagesValue.items) {
    if (item.kind !== "object") {
      continue;
    }
    const fields = fieldMap(item.fields);
    languages.push({
      localizedLanguageCode: stringField(item.fields, "LocalizedLanguageCode"),
      audioProjects: stringsFromArray(fields.get("AudioProjects")),
      stringTables: stringsFromArray(fields.get("StringTables")),
      videoSoundIndex: stringField(item.fields, "VideoSoundIndex"),
    });
  }
  return {
    typeName: resource.typeName,
    storyName: stringField(resource.fields, "StoryName"),
    languages,
  };
}
