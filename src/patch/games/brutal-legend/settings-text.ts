export const SETTINGS_TEXT: Readonly<Record<string, string>> = {
  PMTE030TEXT: "الصوت", PMTE031TEXT: "الموسيقى", PMTE032TEXT: "المؤثرات",
  PMTE035TEXT: "سرعة\nأفقية", PMTE036TEXT: "سرعة\nعمودية",
  BLPC017TEXT: "توهج", BLPC019TEXT: "ظلال محيطية", BLPC022TEXT: "عمق المجال",
  BLPC024TEXT: "جودة المؤثرات", BLPC026TEXT: "وضع العرض",
  BLPC029TEXT: "تزامن رأسي", BLPC043TEXT: "استعادة الافتراضي",
  BLPC049TEXT: "مدى\nالرسم", BLPC051TEXT: "محاكاة دقيقة",
  BLPC052TEXT: "تعيين الأزرار", BLPC053TEXT: "تصفية متباينة",
  BLPC059TEXT: "مجال\nالرؤية", PMTE131TEXT: "تعيين\nالأزرار",
  PMTE159TEXT: "عزف منفرد", PMTE168TEXT: "أمر: الهجوم", PMTE169TEXT: "تسارع",
};
export const SETTINGS_MAIN_IDS = ["PMTE030TEXT", "PMTE031TEXT", "PMTE032TEXT", "PMTE035TEXT", "PMTE036TEXT"];
export const SETTINGS_STATIC_TEXT = [
  { field: 135, text: "وضع العرض", fontSize: 13, width: 125 },
  { field: 146, text: "تنعيم الحواف", fontSize: 13, width: 110 },
] as const;
export function settingsProfile(id: string, text: string) {
  if (SETTINGS_MAIN_IDS.includes(id) || id === "BLPC049TEXT" || id === "BLPC059TEXT")
    return { width: 136, height: 95, fontSize: 30 };
  if (id === "PMTE131TEXT") return { width: 208, height: 120, fontSize: 40 };
  if (id === "BLPC030TEXT" || id === "BLPC031TEXT" || text.length > 45 || /\/[A-Za-z_]+\//.test(text))
    return { width: 420, height: 500, fontSize: 24 };
  return { width: 184, height: 160, fontSize: 30 };
}
