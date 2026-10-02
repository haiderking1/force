/** Corpus strings keep resource-level escapes. Do not render those backslashes. */
export function unescapeCorpusText(text: string): string {
  return text.replace(/\\"/g, '"').replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\\t/g, "\t");
}

export function containsPrivateUse(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code !== undefined && code >= 0xe000 && code <= 0xf8ff) {
      return true;
    }
  }
  return false;
}
