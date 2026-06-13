import { ProviderError } from '../errors.js';

/** Wraps a vendor SDK error as a ProviderError, marking 429/5xx as retryable. */
export function toProviderError(prefix: string, err: unknown): ProviderError {
  const status = (err as any)?.status;
  const retryable = status === 429 || (typeof status === 'number' && status >= 500);
  return new ProviderError(`${prefix}: ${(err as Error).message}`, retryable);
}
