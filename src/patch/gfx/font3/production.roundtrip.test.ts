import { expect, test } from "bun:test";
import path from "node:path";
import { extractBuddhaEntry } from "../../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../../archive/buddha/open.ts";
import { payloadPathFromHeader } from "../../../archive/companion-path.ts";
import {
  BRUTAL_LEGEND_DEFAULT_ROOT,
  BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_FRONTEND_GFX_ENTRY,
  BRUTAL_LEGEND_GFX_PACK,
} from "../../games/brutal-legend/config.ts";
import { decompressGfx, walkSwfTags } from "../swf.ts";
import { parseDefineFont3Tag } from "./parse.ts";
import { serializeDefineFont3Tag } from "./serialize.ts";

test("production DefineFont3 tags serialize to the original tag bytes", async () => {
  const headerPath = path.join(BRUTAL_LEGEND_DEFAULT_ROOT, BRUTAL_LEGEND_GFX_PACK);
  if (!(await Bun.file(headerPath).exists())) {
    throw new Error("installed Brütal Legend Man_Gfx pack is required");
  }
  const list = await openBuddhaPack({ headerPath, payloadPath: payloadPathFromHeader(headerPath) });
  const files = [
    await extractBuddhaEntry(list, BRUTAL_LEGEND_FONTS_GFX_ENTRY),
    await extractBuddhaEntry(list, BRUTAL_LEGEND_FRONTEND_GFX_ENTRY),
  ];
  let count = 0;
  for (const file of files) {
    const gfx = decompressGfx(file.bytes);
    for (const tag of walkSwfTags(gfx.body).tags) {
      if (tag.type !== 75) {
        continue;
      }
      const parsed = parseDefineFont3Tag(tag.data);
      const bytes = serializeDefineFont3Tag(parsed);
      expect(bytes).toEqual(tag.data);
      expect(parsed.hasLayout).toBe(true);
      expect(parsed.wideCodes).toBe(true);
      count += 1;
    }
  }
  expect(count).toBe(5);
});
