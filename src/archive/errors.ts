export class ArchiveError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ArchiveError";
    this.code = code;
  }
}

export function isArchiveError(error: unknown): error is ArchiveError {
  return error instanceof ArchiveError;
}
