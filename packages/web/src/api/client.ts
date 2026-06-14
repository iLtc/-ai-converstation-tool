const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  code: string;
  status: number;
  retryable?: boolean;
  sessionIds?: string[];
  details?: unknown;
  constructor(status: number, body: { code: string; message: string; [k: string]: unknown }) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    if (typeof body.retryable === 'boolean') this.retryable = body.retryable;
    if (Array.isArray(body.sessionIds)) this.sessionIds = body.sessionIds as string[];
    if ('details' in body) this.details = body.details;
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const envelope = (data?.error ?? { code: 'unknown', message: res.statusText }) as
      { code: string; message: string; [k: string]: unknown };
    throw new ApiError(res.status, envelope);
  }
  return data as T;
}
