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
  {
    lineCode: "TOGU041TEXT",
    role: "difficulty-brutal",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *TOGU041TEXT; 3rd difficulty choice next to PMTE100TEXT",
  },
  {
    lineCode: "TOLB065TEXT",
    role: "dialog-cancel",
    font: { kind: "imported", alias: "$Condensed", family: "TG_Condensed" },
    evidence: "DoInitAction *TOLB065TEXT; cancel button on MessageBox hintbar_popup",
  },
  {
    lineCode: "TOLB066TEXT",
    role: "dialog-accept",
    font: { kind: "imported", alias: "$Condensed", family: "TG_Condensed" },
    evidence: "DoInitAction *TOLB066TEXT; accept button on MessageBox hintbar_popup",
  },
  {
    lineCode: "TOLB134TEXT",
    role: "dialog-warning-title",
    font: { kind: "imported", alias: "$Fancy", family: "Schreibweise" },
    evidence: "DoAction *TOLB134TEXT; warning dialog title in DefineEditText 338",
  },
  {
    lineCode: "PMTE102TEXT",
    role: "dialog-overwrite-warning",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *PMTE102TEXT; overwrite save warning body in DefineEditText 337",
  },
  {
    lineCode: "PMTE103TEXT",
    role: "dialog-profile-warning",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *PMTE103TEXT; profile not signed in warning body in DefineEditText 337",
  },
  {
    lineCode: "TCRR002TEXT",
    role: "dialog-save-device-warning",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *TCRR002TEXT; save device warning body in DefineEditText 337",
  },
  {
    lineCode: "PMTE107TEXT",
    role: "dialog-load-warning",
    font: { kind: "imported", alias: "$Menu", family: "TG_Menu" },
    evidence: "DoAction *PMTE107TEXT; chapter load warning body in DefineEditText 337",
  },
];

export const BRUTAL_LEGEND_EDIT_TEXT_ALIGNMENTS = [
  { id: 337, align: "right" as const, role: "messagebox-message" },
  { id: 338, align: "right" as const, role: "messagebox-title" },
] as const;

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
