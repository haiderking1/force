// Widths are measured in the owning GFX stage, at the actual field font size.
// Leave room for Scaleform gutters and the runtime RockStance button icon.
export const UI_TEXT_CORRECTIONS = [
  { id: "TOSK023TEXT", text: "تحذير: إذا واصلت التحرك في هذا الاتجاه، فستخرج من منطقة اللعب.",
    profile: { width: 500, height: 115, fontSize: 27 },
    asset: "data/ui/hud/opt/hud.gfx", field: 245, family: "TG_Condensed", maxLines: 2 },
  { id: "AAAY052TEXT", text: "استدعاء الدوس",
    // One 120px line. Force's logical line height includes extra baseline space.
    profile: { width: 980, height: 180, fontSize: 120 },
    asset: "data/ui/tc_summondeuce/opt/tc_summondeuce.gfx", field: 21, family: "MTL-150", maxLines: 1 },
  { id: "AAAY053TEXT", text: "معزوفة قوية تستدعي سيارة الدوس.",
    profile: { width: 646, height: 93, fontSize: 40 },
    asset: "data/ui/tc_summondeuce/opt/tc_summondeuce.gfx", field: 22, family: "MTL-150", maxLines: 1 },
  { id: "AAAY054TEXT", text: "اضغط باستمرار على /RockStance/ واختر معزوفة استدعاء الدوس من القائمة.",
    profile: { width: 480, height: 310, fontSize: 40 },
    asset: "data/ui/tc_summondeuce/opt/tc_summondeuce.gfx", field: 23, family: "MTL-150", maxLines: 4 },
] as const;
