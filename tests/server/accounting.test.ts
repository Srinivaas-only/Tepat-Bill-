import { describe, it, expect, vi } from 'vitest';
import { connectorFromEnv, signBody, simulatedConnector, webhookConnector, type AccountingPayload } from '../../src/server/accounting';

const payload: AccountingPayload = { schema: 'tepat-bill.accounting.v0-draft', generatedAt: '2026-10-24T00:00:00.000Z', currency: 'MYR', suppliers: [] };

describe('accounting connector (nothing is sent unless explicitly configured)', () => {
  it('defaults to the simulation and never calls fetch', async () => {
    const f = vi.fn();
    for (const env of [{}, { ACCOUNTING_WEBHOOK_URL: 'https://x.example/hook' }, { ACCOUNTING_WEBHOOK_SECRET: 's' }, { ACCOUNTING_WEBHOOK_URL: 'http://insecure.example', ACCOUNTING_WEBHOOK_SECRET: 's' }]) {
      const c = connectorFromEnv(env as NodeJS.ProcessEnv, f as unknown as typeof fetch);
      expect(c.mode).toBe('simulated');
      expect((await c.send(payload)).detail).toContain('nothing was sent');
    }
    expect(f).not.toHaveBeenCalled();
    expect(simulatedConnector.mode).toBe('simulated');
  });
  it('webhook mode needs https + secret, signs the exact body, and reports failures instead of throwing', async () => {
    const f = vi.fn(async () => new Response('ok', { status: 202 }));
    const c = connectorFromEnv({ ACCOUNTING_WEBHOOK_URL: 'https://x.example/hook', ACCOUNTING_WEBHOOK_SECRET: 'top' } as NodeJS.ProcessEnv, f as unknown as typeof fetch);
    expect(c.mode).toBe('webhook');
    const r = await c.send(payload);
    expect(r).toMatchObject({ mode: 'webhook', ok: true, detail: 'HTTP 202' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.example/hook');
    expect((init.headers as Record<string, string>)['x-tepat-signature']).toBe(signBody('top', JSON.stringify(payload)));
    const bad = await webhookConnector('https://x.example/hook', 'top', (async () => { throw new Error('boom'); }) as unknown as typeof fetch).send(payload);
    expect(bad).toMatchObject({ ok: false, detail: 'boom' });
  });
});
