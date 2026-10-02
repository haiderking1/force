/** Source-guarded corrections for puzzle clues and reviewed terminology. */
const reviewed = new Map<string, string>([
  ['"The girl. The girl who died and the innocent with her. Matins. Chapter."', '"الفتاة. الفتاة التي ماتت، والبريء الذي مات معها. صلاة السحر. قاعة الرهبان."'],
  ['"Remember the girl. One grave for two innocents. The red bird flies. Matins. Chapter."', '"تذكر الفتاة. قبر واحد لبريئين. الطائر الأحمر يحلق. صلاة السحر. قاعة الرهبان."'],
  ['"Remember what he did. The violence you suffered. The red bird flies. Matins. Chapter."', '"تذكري ما فعله، والعنف الذي تعرضت له. الطائر الأحمر يحلق. صلاة السحر. قاعة الرهبان."'],
  ['"Remember your husband. The pain he carried, like Job. The red bird flies. Matins. Chapter."', '"تذكري زوجك والألم الذي تحمله كأيوب. الطائر الأحمر يحلق. صلاة السحر. قاعة الرهبان."'],
  ['"He knows. He\'s knows and he\'s coming for you. The Rathaus. After Saint John\'s fire."', '"إنه يعرف. إنه يعرف، وهو قادم من أجلك. دار البلدية. بعد نار عيد القديس يوحنا."'],
  ['"He knows who you are now. He won’t stop. The Rathaus. After Saint John’s fire."', '"إنه يعرف الآن من تكونين. لن يتوقف. دار البلدية. بعد نار عيد القديس يوحنا."'],
  ['"He will destroy the abbey. Hell will swallow the Hand of Saint Moritz. The Rathaus. After Saint John’s fire."', '"سيدمر الدير. وستلتهم جهنم يد القديس موريتز. دار البلدية. بعد نار عيد القديس يوحنا."'],
  ['The visiting nobleman, Lorenz Rothvogel, was found murdered in the chapter house.', 'عُثر على النبيل الزائر، لورنتس روثفوغل، مقتولًا في قاعة الرهبان.'],
  ["Doesn't stop her getting hysterical about it.", 'لكن ذلك لا يمنعها من الانفعال إلى حد الهستيريا بسببه.'],
  ['Hmm. "Saint John\'s Fire..." I wonder if that means the bonfire.', 'همم. "نار القديس يوحنا..." أتساءل إن كان المقصود نار الاحتفال.'],
  ['"One grave for two innocents." Isn\'t that the grave in the forest?', '"قبر واحد لبريئين." أليس ذلك القبر في الغابة؟'],
]);

export function correctPentimentText(source: string, translation: string): string {
  const exact = reviewed.get(source);
  if (exact !== undefined) return exact;
  let text = translation;
  if (/\bMatins\b/i.test(source)) text = text.replaceAll("صلاة الفجر", "صلاة السحر").replaceAll("صلاة الصباح", "صلاة السحر").replaceAll("صلاة السَّحَر", "صلاة السحر");
  if (/\bchapter house\b/i.test(source)) {
    const location = /convent chapter house/i.test(source) ? "قاعة الراهبات" : "قاعة الرهبان";
    for (const old of ["قاعة فصل الدير", "قاعة الفصل", "بيت الاجتماع", "بيت الفصل"]) text = text.replaceAll(old, location);
  }
  return text;
}
