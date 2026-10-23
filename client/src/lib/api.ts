export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) { super(message); }
}

async function parse(res: Response) {
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await res.json().catch(() => null) : null;
  if (res.ok) sessionStorage.removeItem('tb_401');
  if (!res.ok) {
    if (res.status === 401 && !res.url.includes('/api/auth/') && !sessionStorage.getItem('tb_401')) { sessionStorage.setItem('tb_401', '1'); window.location.assign('/'); }
    const e = body?.error ?? {};
    const { code, message, ...extra } = e;
    throw new ApiError(res.status, code ?? 'error', message ?? res.statusText, extra);
  }
  return body;
}

const timeout = (path: string) => AbortSignal.timeout(path.endsWith('/extract') ? 50_000 : 20_000);
const send = (method: string, path: string, body?: unknown) => fetch('/api' + path, {
  method, credentials: 'same-origin', signal: timeout(path), ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
}).then(parse);

export const api = {
  get: <T>(path: string): Promise<T> => send('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => send('POST', path, body),
  put: <T>(path: string, body?: unknown): Promise<T> => send('PUT', path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => send('PATCH', path, body),
};
