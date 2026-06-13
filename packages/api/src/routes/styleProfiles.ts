import { Hono } from 'hono';
import { CreateStyleProfileInput } from '@app/shared';
import type { AppContext } from '../app.js';
import { parseBody } from './validate.js';
import { createStyleProfile, listStyleProfiles } from '../services/styleProfiles.js';

export function styleProfileRoutes() {
  const r = new Hono<AppContext>();

  r.post('/', async (c) => {
    const input = parseBody(CreateStyleProfileInput, await c.req.json());
    return c.json(await createStyleProfile(c.get('deps').db, c.get('userId'), input), 201);
  });

  r.get('/', async (c) => {
    return c.json(await listStyleProfiles(c.get('deps').db, c.get('userId')));
  });

  return r;
}
