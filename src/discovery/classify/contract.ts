export const JEV_CONTRACT_SOURCES = [
  "https://docs.typesafe.ai/api",
  "https://docs.typesafe.ai/models",
  "https://docs.typesafe.ai/primitives/noul",
  "https://docs.typesafe.ai/",
] as const;

export const JEV_DEFAULT_BASE_URL = "https://api.typesafe.ai";
export const JEV_EVALUATE_PATH = "/v1/systemone";
export const JEV_DEFAULT_MODEL = "jev-latest";
export const JEV_PINNED_MODEL_DOCUMENTED = "jev-1.13.0";
export const JEV_QUESTION_SET_VERSION = "force-discovery-roles-v1";

export type JevNoulCriteria = {
  readonly true: string;
  readonly false: string;
};

export type JevNoulQuestion = {
  readonly type: "noul";
  readonly instructions: string;
  readonly criteria?: JevNoulCriteria;
};

export type JevChoiceQuestion = {
  readonly type: "choice";
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string | null>>;
};

export type JevScoreQuestion = {
  readonly type: "score";
  readonly instructions: string;
  readonly criteria: readonly string[];
};

export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;

export type JevRequestBody = {
  readonly model: string;
  readonly state: unknown;
  readonly questions: Readonly<Record<string, JevQuestion>>;
};

export type JevNoulAnswer = {
  readonly type: "noul";
  readonly noul: number;
};

export type JevChoiceAnswer = {
  readonly type: "choice";
  readonly choice: string;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
};

export type JevScoreAnswer = {
  readonly type: "score";
  readonly score: number;
  readonly legend: Readonly<Record<string, string>>;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
};

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export type JevResponseBody = {
  readonly model: string;
  readonly answers: Readonly<Record<string, JevAnswer>>;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
};

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
