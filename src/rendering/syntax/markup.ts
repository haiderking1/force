import { TokenSyntaxError } from "../errors.ts";

export type BraceRole =
  | { readonly kind: "placeholder" }
  | { readonly kind: "open"; readonly name: string }
  | { readonly kind: "close"; readonly name: string };

const NUMBERED_PLACEHOLDER = /^\{\d+\}$/;

export function classifyBrace(raw: string): BraceRole {
  if (NUMBERED_PLACEHOLDER.test(raw)) {
    return { kind: "placeholder" };
  }

  if (raw.startsWith("{/") && raw.endsWith("}")) {
    return { kind: "close", name: raw.slice(2, -1) };
  }

  const inner = raw.slice(1, -1);
  const eq = inner.indexOf("=");
  const name = eq === -1 ? inner : inner.slice(0, eq);
  return { kind: "open", name };
}

export class MarkupStack {
  private readonly names: string[] = [];

  apply(raw: string): void {
    const role = classifyBrace(raw);
    if (role.kind === "placeholder") {
      throw new TokenSyntaxError(`brace placeholder ${raw} is not markup`, "BRACE_IS_PLACEHOLDER");
    }

    if (role.kind === "close") {
      const open = this.names.pop();
      if (open === undefined) {
        throw new TokenSyntaxError(`unmatched closing tag ${raw}`, "UNMATCHED_CLOSING_TAG");
      }
      if (open !== role.name) {
        throw new TokenSyntaxError(
          `mismatched markup tags: opened {${open}} but closed ${raw}`,
          "MISMATCHED_MARKUP_TAG",
        );
      }
      return;
    }

    this.names.push(role.name);
  }

  finish(): void {
    const leftover = this.names[this.names.length - 1];
    if (leftover !== undefined) {
      throw new TokenSyntaxError(`unclosed markup tag {${leftover}}`, "UNCLOSED_MARKUP_TAG");
    }
  }
}
