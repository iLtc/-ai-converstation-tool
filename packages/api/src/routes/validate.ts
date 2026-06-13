import type { z } from 'zod';
import { ValidationError } from '../errors.js';

/** Parses a request body with a zod schema, throwing a ValidationError on failure. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }
  return result.data;
}
