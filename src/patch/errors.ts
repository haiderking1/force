export class PatchError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PatchError";
    this.code = code;
  }
}

export function isPatchError(error: unknown): error is PatchError {
  return error instanceof PatchError;
}
