export const BRUTAL_LEGEND_GAME_ID = "brutal-legend";

export const BRUTAL_LEGEND_SKIP_EVIDENCE_EXTENSIONS = [
  ".bik",
  ".fsb",
  ".fev",
  ".cab",
  ".~p",
  ".exe",
  ".dll",
  ".ttf",
  ".otf",
] as const;

export const BRUTAL_LEGEND_TEXT_EXTENSIONS = [".txt", ".cfg", ".lua", ".json", ".xml", ".ini"] as const;

export const BRUTAL_LEGEND_SCALEFORM_EXTENSIONS = [".gfx"] as const;

export const BRUTAL_LEGEND_ALWAYS_EVIDENCE_EXTENSIONS = [".txt", ".cfg", ".lua"] as const;

export const BRUTAL_LEGEND_INTERESTING_TYPES = [
  "VidSubtitles",
  "Story",
  "SystemLineCodes",
  "JournalEntries",
  "DUIMovie",
  "Packfile",
] as const;

export const BRUTAL_LEGEND_SKIP_EVIDENCE_MIN_SIZE = 8 * 1024 * 1024;
