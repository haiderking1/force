export type BuddhaTextValue =
  | { readonly kind: "empty" }
  | { readonly kind: "string"; readonly value: string; readonly quoted: boolean; readonly byteOffset: number }
  | { readonly kind: "reference"; readonly value: string; readonly byteOffset: number }
  | { readonly kind: "object"; readonly typeName: string; readonly fields: readonly BuddhaTextField[] }
  | { readonly kind: "array"; readonly items: readonly BuddhaTextValue[] };

export type BuddhaTextField = {
  readonly key: string;
  readonly keyOffset: number;
  readonly value: BuddhaTextValue;
};

export type BuddhaTextResource = {
  readonly declaredSize: number;
  readonly version: string;
  readonly typeName: string;
  readonly fields: readonly BuddhaTextField[];
  readonly bodyByteOffset: number;
};
