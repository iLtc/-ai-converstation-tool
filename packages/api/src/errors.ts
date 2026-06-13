/** Base for errors the API maps to a specific HTTP status + machine code. */
export class AppError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) { super(`${what} not found`, 'not_found', 404); }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(message, 'conflict', 409); }
}

export class ValidationError extends AppError {
  constructor(message: string, readonly details?: unknown) {
    super(message, 'validation_error', 400);
  }
}

/** Provider failure (rate limit / timeout / 5xx). retryable hints the UI. */
export class ProviderError extends AppError {
  constructor(message: string, readonly retryable: boolean) {
    super(message, 'provider_error', 502);
  }
}

/** Incompressible context (timeline + current session) alone exceeds budget. */
export class ContextTooLargeError extends AppError {
  constructor(message: string) { super(message, 'context_too_large', 413); }
}

/** Even fully-summarized priors don't fit; UI must let the user pick sessions. */
export class NeedsManualSelectionError extends AppError {
  constructor(readonly sessionIds: string[]) {
    super('Context exceeds budget; choose which prior sessions to include', 'needs_manual_selection', 413);
  }
}
