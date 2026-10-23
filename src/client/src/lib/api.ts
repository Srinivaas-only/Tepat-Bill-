export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) { super(message); }
}

async function parse(res: Response) {
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const e = body?.error ?? {};
    const { code, message, ...extra } = e;
    throw new ApiError(res.status, code ?? 'error', message ?? res.statusText, extra);
  }
  return body;
}

export const api = {
  get: <T>(path: string): Promise<T> => fetch('/api' + path, { credentials: 'same-origin' }).then(parse),
  post: <T>(path: string, body?: unknown): Promise<T> => fetch('/api' + path, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
  }).then(parse),
  put: <T>(path: string, body?: unknown): Promise<T> => fetch('/api' + path, {
    method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
  }).then(parse),
  patch: <T>(path: string, body?: unknown): Promise<T> => fetch('/api' + path, {
    method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
  }).then(parse),
};
