import { setupServer } from 'msw/node';

// Tests register per-case handlers with server.use(...). Base handlers stay empty
// so an unhandled request fails loudly (onUnhandledRequest: 'error' in setup).
export const server = setupServer();
