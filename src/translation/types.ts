export type SourceText = {
  readonly id: string;
  readonly text: string;
};

export type TranslationItem = {
  readonly id: string;
  readonly text: string;
};

export type TranslateRequest = {
  readonly targetLanguage: string;
  readonly items: readonly SourceText[];
  readonly placeholders: readonly string[];
};

export type TranslateResult = {
  readonly translations: readonly TranslationItem[];
};

export type TranslateOptions = {
  readonly signal?: AbortSignal;
};

export type TranslationClient = {
  buildOutbound(request: TranslateRequest): OutboundRequest;
  translate(request: TranslateRequest, options?: TranslateOptions): Promise<TranslateResult>;
};

export type OutboundRequest = {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
};
