import { expect, test } from "bun:test";
import { originalGamePack } from "./original-game.ts";
import { extractBuddhaEntry } from "../../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../../archive/buddha/open.ts";
import {
  BRUTAL_LEGEND_FONTS_GFX_ENTRY,
  BRUTAL_LEGEND_FRONTEND_GFX_ENTRY,
  BRUTAL_LEGEND_GFX_PACK,
} from "../config.ts";
import { decompressGfx, walkSwfTags } from "../../../patch/gfx/swf.ts";
import { parseDefineFont3Tag } from "../../../patch/gfx/font3/parse.ts";
import { serializeDefineFont3Tag } from "../../../patch/gfx/font3/serialize.ts";

test("production DefineFont3 tags serialize to the original tag bytes", async () => {
  const { headerPath, payloadPath } = await originalGamePack(BRUTAL_LEGEND_GFX_PACK, process.env);
  const list = await openBuddhaPack({ headerPath, payloadPath });
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
