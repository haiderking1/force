export type MenuFieldFont =
  | { readonly kind: "imported"; readonly alias: "$Menu" | "$Condensed" | "$Fancy"; readonly family: string }
  | { readonly kind: "embedded"; readonly family: string };

export type MenuFieldSpec = {
  readonly lineCode: string;
  readonly role: string;
  readonly font: MenuFieldFont;
  readonly evidence: string;
};

export const BRUTAL_LEGEND_IMPORTED_FONTS = [
  { alias: "$Menu" as const, family: "TG_Menu", gfx: "englishfonts" as const },
  { alias: "$Condensed" as const, family: "TG_Condensed", gfx: "englishfonts" as const },
  { alias: "$Fancy" as const, family: "Schreibweise", gfx: "englishfonts" as const },
] as const;

export const BRUTAL_LEGEND_EMBEDDED_MENU_FONTS = [
  { family: "Zamora", gfx: "frontend" as const },
] as const;

export const BRUTAL_LEGEND_TITLE_FRAME_LABELS = ["New Game", "Continue", "Options", "Extras"] as const;

export const BRUTAL_LEGEND_V2_MENU_FIELDS: readonly MenuFieldSpec[] = [
  {
    lineCode: "PMTE028TEXT",
    role: "footer-back",
    font: { kind: "imported", alias: "$Condensed", family: "TG_Condensed" },
    evidence: "DefineEditText id 362 initial *PMTE028TEXT face=$Condensed",
  },
  {
    lineCode: "PMTE029TEXT",
    role: "footer-select",
    font: { kind: "imported", alias: "$Condensed", family: "TG_Condensed" },
    evidence: "DoInitAction *PMTE029TEXT; paired footer with BACK, no unique EditText",
  },
  {
    lineCode: "TCRR003TEXT",
    role: "confirm-yes",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *TCRR003TEXT; confirm dialog from title-menu flow",
  },
  {
    lineCode: "TCRR004TEXT",
    role: "confirm-no",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *TCRR004TEXT; confirm dialog from title-menu flow",
  },
  {
    lineCode: "PMTE073TEXT",
    role: "quit-prompt",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *PMTE073TEXT; quit confirm used from frontend menus",
  },
  {
    lineCode: "TMPP159TEXT",
    role: "are-you-sure",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *TMPP159TEXT; paired with quit confirm",
  },
  {
    lineCode: "TOGU036TEXT",
    role: "difficulty-gentle",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *TOGU036TEXT; difficulty choices next to PMTE100TEXT",
  },
  {
    lineCode: "TOGU038TEXT",
    role: "difficulty-normal",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *TOGU038TEXT; difficulty choices next to PMTE100TEXT",
  },
  {
    lineCode: "PMTE100TEXT",
    role: "difficulty-heading",
    font: { kind: "embedded", family: "Zamora" },
    evidence: "DefineEditText id 353 initial *PMTE100TEXT face=Zamora",
  },
];

export const BRUTAL_LEGEND_V2_FIELD_IDS = BRUTAL_LEGEND_V2_MENU_FIELDS.map((field) => field.lineCode);

export function fontsRequiredForV2Fields(): {
  readonly englishFontFamilies: readonly string[];
  readonly frontendFontFamilies: readonly string[];
} {
  const english = new Set<string>();
  const frontend = new Set<string>();
  for (const field of BRUTAL_LEGEND_V2_MENU_FIELDS) {
    if (field.font.kind === "imported") {
      english.add(field.font.family);
    } else {
      frontend.add(field.font.family);
    }
  }
  for (const imported of BRUTAL_LEGEND_IMPORTED_FONTS) {
    english.add(imported.family);
  }
  return {
    englishFontFamilies: [...english],
    frontendFontFamilies: [...frontend],
  };
}
