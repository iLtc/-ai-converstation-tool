import { setupServer } from 'msw/node';
import type { RequestHandler } from 'msw';

// Tests register per-case handlers with server.use(...). Base handlers stay empty
// so an unhandled request fails loudly (onUnhandledRequest: 'error' in setup).
export const server = setupServer();

export function asHandlers(...handlers: RequestHandler[]) {
  return handlers;
}
