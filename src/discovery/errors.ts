export class DiscoveryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DiscoveryError";
    this.code = code;
  }
}

export class DiscoveryHttpError extends DiscoveryError {
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, retryable: boolean) {
    super("HTTP", `Jev request failed (HTTP ${status})`);
    this.name = "DiscoveryHttpError";
    this.status = status;
    this.retryable = retryable;
  }
}

export function isDiscoveryError(error: unknown): error is DiscoveryError {
  return error instanceof DiscoveryError;
}

export function discoveryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Unknown discovery error";
}
