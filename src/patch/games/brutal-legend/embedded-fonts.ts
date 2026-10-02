// The installed game-text-v1 encoder allocated its shared 501 glyphs here.
// Existing menu and intro allocations below this range must stay untouched.
export const GAME_TEXT_GLYPH_FIRST = 0xe0b6;
export const GAME_TEXT_GLYPH_COUNT = 501;
export const EMBEDDED_TEXT_FAMILIES = new Set([
  "MTL-150", "Simeon AS Regular", "Colossalis Black", "Zamora", "TG_Menu",
]);

// Tiny font stubs import their real glyphs from gfxfontlib; do not turn those
// into embedded font definitions. Audited real copies have at least 115 glyphs.
export const MIN_EMBEDDED_GLYPHS = 32;
