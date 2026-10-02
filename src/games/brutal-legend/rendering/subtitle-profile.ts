import { PatchError } from "../../../patch/errors.ts";
import { parseDefineEditText } from "../../../patch/gfx/edit-text.ts";
import { parseSwfRect } from "../../../patch/gfx/rect.ts";
import { decompressGfx, walkSwfTags } from "../../../patch/gfx/swf.ts";

export const SUBTITLE_ASSET = "data/ui/subtitle/opt/subtitle.gfx";
export const SUBTITLE_FONT = "TG_Condensed";
export const SUBTITLE_FONT_FAMILIES = ["TG_Condensed", "TG_Menu", "Schreibweise"] as const;
export const SUBTITLE_TIMING_PACK = "Win/Packs/Man_Trivial.~h";
export const INTRO_SUBTITLE_ENTRY = "gameplay/subtitles/intr1";
export const SUBTITLE_SPRITE_ID = 8;
export const SUBTITLE_ROOT_NAME = "Subtitle";
export const SUBTITLE_LOWER_TWIPS = 720;
export const SUBTITLE_BOTTOM_MARGIN_PX = 40;

export type SubtitleFieldProfile = {
  readonly id: number;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
};

export const SUBTITLE_FIELD_PROFILES: readonly SubtitleFieldProfile[] = [
  { id: 2, label: "default", width: 560, height: 120, fontSize: 24 },
  { id: 3, label: "MotorForge", width: 410, height: 128, fontSize: 24 },
  { id: 4, label: "MissionIntro", width: 560, height: 120, fontSize: 24 },
  { id: 5, label: "OffScreen", width: 560, height: 120, fontSize: 24 },
  { id: 7, label: "field7", width: 560, height: 96, fontSize: 24 },
];

export const SUBTITLE_WRAP_PROFILE = { width: 410, height: 96, fontSize: 24, minimumSize: 16 };
export const GENERAL_TEXT_PROFILE = { width: 560, height: 400, fontSize: 24, minimumSize: 16 };
export const OVERFLOW_TEXT_PROFILE = { width: 410, height: 800, fontSize: 24, minimumSize: 16 };
export const OVERFLOW_UI_PROFILE = { width: 560, height: 800, fontSize: 24, minimumSize: 16 };

export function introSubtitleProfile(bytes: Uint8Array) {
  // Subtitle sprite 8, frame label "default", places DefineEditText 2.
  // MotorForge uses field 3 with a narrower box and needs a separate profile.
  const tag = walkSwfTags(decompressGfx(bytes).body).tags.find(
    (tag) => tag.type === 37 && parseDefineEditText(tag.data).id === 2,
  );
  if (!tag) throw new PatchError("GFX", "Default subtitle field 2 is missing");
  const edit = parseDefineEditText(tag.data);
  const bounds = parseSwfRect(tag.data, 2);
  if (edit.fontFace !== "$Condensed" || edit.fontHeight !== 480 || edit.align !== "center" ||
      bounds.xMax - bounds.xMin !== 11480 || bounds.yMax - bounds.yMin !== 2525) {
    throw new PatchError("GFX", "Subtitle field differs from the inspected intro profile");
  }
  return { width: 560, height: 120, fontSize: 24 };
}

export function introDisplayText(text: string): string {
  // Saved corpus strings retain these resource-level escapes. Do not render
  // their backslashes as glyphs. Control tokens remain rejected by the planner.
  return text.replace(/\\"/g, '"').replace(/\\r\\n|\\n|\\r/g, "\n");
}
