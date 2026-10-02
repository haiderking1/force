import type { Character, Line } from "../../rendering/types.ts";

export type RichStyle = { readonly open: string; readonly close: string };
export type RichText = { readonly lines: readonly Line[]; readonly styles: readonly RichStyle[] };

/** Parse only explicitly supported paired tags; never bake opaque game controls. */
export function parseUnityRichText(text: string, pairedTags: ReadonlySet<string>): RichText {
  const lines: Line[] = [];
  const styles: RichStyle[] = [];
  const stack: { id: number; name: string }[] = [];
  let chars: Character[] = [];
  for (let offset = 0; offset < text.length;) {
    if (text[offset] === "<") {
      const match = /^<(\/?)([A-Za-z][A-Za-z0-9]*)([^<>]*)>/.exec(text.slice(offset));
      if (!match || !match[2] || !pairedTags.has(match[2])) throw new Error("Unsupported Unity rich-text control");
      const name = match[2];
      if (match[1]) {
        const top = stack.pop();
        if (!top || top.name !== name || match[3] !== "") throw new Error("Mismatched rich-text closing tag");
      } else {
        const id = styles.length;
        styles.push({ open: match[0], close: `</${name}>` });
        stack.push({ id, name });
      }
      offset += match[0].length;
      continue;
    }
    const cp = text.codePointAt(offset);
    if (cp === undefined) break;
    if (cp === 123 || cp === 125 || cp === 92 || cp === 0xfffc) throw new Error("Runtime placeholder needs a measured runtime adapter");
    if (cp === 10 || cp === 13) {
      lines.push({ chars, breakStyles: stack.map(s => s.id), newline: true });
      chars = [];
      offset += cp === 13 && text[offset+1] === "\n" ? 2 : 1;
      continue;
    }
    chars.push({ codepoint: cp, styles: stack.map(s => s.id) });
    offset += cp > 0xffff ? 2 : 1;
  }
  if (stack.length) throw new Error("Unclosed Unity rich-text tag");
  lines.push({ chars, breakStyles: [], newline: false });
  return { lines, styles };
}
