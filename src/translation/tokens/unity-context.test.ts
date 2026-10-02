import { expect, test } from "bun:test";
import { collectTokensInText } from "./scan.ts";
import { protectRequest } from "./protected-request.ts";
import { buildTranslationUserPayload } from "../prompts/user-payload.ts";
import { buildCheckpointIdentity } from "../corpus/plan.ts";
import { mapExtractedStringTableRecords } from "../formats/extracted-strings/load.ts";

const row = { archiveHeader: "text.json", entryType: "StringTable", entryName: "gui", entryIndex: 0,
  recordId: "id", text: "<size=70%>Hello {1:d MMMM yyyy}</size>", context: "Historical dialogue" };

test("TMP shorthand markup and .NET format fields remain opaque", () => {
  expect(collectTokensInText(row.text)).toEqual(["{1:d MMMM yyyy}", "<size=70%>", "</size>"]);
  expect(collectTokensInText("{0,-8:N2}")).toContain("{0,-8:N2}");
  const items = mapExtractedStringTableRecords([row]);
  const protectedRequest = protectRequest({ targetLanguage: "ar", items, placeholders: [] });
  expect(protectedRequest.request.items[0]?.context).toBe(row.context);
  expect(buildTranslationUserPayload(protectedRequest.request).items[0]?.context).toBe(row.context);
  const result = protectedRequest.restore({ translations: protectedRequest.request.items.map(item => ({ id: item.id, text: item.text.replace("Hello", "أهلا") })) });
  expect(result.translations[0]?.text).toBe("<size=70%>أهلا {1:d MMMM yyyy}</size>");
});

test("translation context participates in checkpoint identity", () => {
  const base = { items: mapExtractedStringTableRecords([row]), targetLanguage: "ar", placeholders: [],
    provider: "test", model: "test", baseUrl: "https://example.invalid", temperature: 0, batchSize: 1 };
  const first = buildCheckpointIdentity(base);
  const changed = buildCheckpointIdentity({ ...base, items: mapExtractedStringTableRecords([{ ...row, context: "Different context" }]) });
  expect(first.sourceHash).not.toBe(changed.sourceHash);
});
