import { http, HttpResponse } from 'msw';
import { server } from '../test/msw.ts';
import { apiFetch, ApiError } from './client.ts';

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    server.use(http.get('/api/ping', () => HttpResponse.json({ ok: true })));
    await expect(apiFetch('/ping')).resolves.toEqual({ ok: true });
  });

  it('returns undefined for 204 responses', async () => {
    server.use(http.post('/api/noop', () => new HttpResponse(null, { status: 204 })));
    await expect(apiFetch('/noop', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('throws ApiError carrying code, message, and subclass extras', async () => {
    server.use(http.post('/api/x', () => HttpResponse.json(
      { error: { code: 'provider_error', message: 'rate limited', retryable: true } },
      { status: 502 },
    )));
    const err = await apiFetch('/x', { method: 'POST' }).catch((e) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('provider_error');
    expect(err.message).toBe('rate limited');
    expect(err.retryable).toBe(true);
    expect(err.status).toBe(502);
  });

  it('surfaces validation details and needs_manual_selection sessionIds', async () => {
    server.use(http.post('/api/v', () => HttpResponse.json(
      { error: { code: 'validation_error', message: 'bad', details: { a: 1 } } },
      { status: 400 },
    )));
    const err = await apiFetch('/v', { method: 'POST' }).catch((e) => e) as ApiError;
    expect(err.details).toEqual({ a: 1 });
  });

  it('maps needs_manual_selection sessionIds (409)', async () => {
    server.use(http.post('/api/m', () => HttpResponse.json(
      { error: { code: 'needs_manual_selection', message: 'too long', sessionIds: ['id-1', 'id-2'] } },
      { status: 409 },
    )));
    const err = await apiFetch('/m', { method: 'POST' }).catch((e) => e) as ApiError;
    expect(err.code).toBe('needs_manual_selection');
    expect(err.sessionIds).toEqual(['id-1', 'id-2']);
    expect(err.status).toBe(409);
  });
});
