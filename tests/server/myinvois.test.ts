import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { prepareSelfBilled, toMyInvoisUbl } from '../../src/shared/core';
import { myInvoisConfigured, packDocument, submitToMyInvois } from '../../src/server/myinvois';

const draft = prepareSelfBilled({ id: 'S', name: 'Guangzhou Hengda Snacks', isForeign: true, country: 'CN' },
  { id: 'I', invoiceNo: 'GZ-2026-088', issuedAt: 0, currency: 'USD', exchangeRateToMYR: 4.2, lines: [{ description: 'Roasted Seaweed Snack', qty: 20, unitPriceSen: 550 }, { description: 'Dried Shiitake', qty: 10, unitPriceSen: 1200 }] },
  { name: 'Kedai Runcit Maju', tin: 'C1234567890', brn: '202001000001', address: 'No. 12, Jalan Bendahara, Ipoh' })!;

describe('MyInvois UBL (self-billed, type 11)', () => {
  const ubl = toMyInvoisUbl(draft, new Date('2026-10-24T06:00:00Z')) as any;
  const inv = ubl.Invoice[0];
  it('is a self-billed invoice with the foreign supplier TIN and the Malaysian buyer as customer', () => {
    expect(inv.InvoiceTypeCode[0]).toMatchObject({ _: '11', listVersionID: '1.0' });
    expect(inv.AccountingSupplierParty[0].Party[0].PartyIdentification[0].ID[0]).toMatchObject({ _: 'EI00000000030', schemeID: 'TIN' });
    expect(inv.AccountingCustomerParty[0].Party[0].PartyIdentification[0].ID[0]._).toBe('C1234567890');
    expect(inv.AccountingSupplierParty[0].Party[0].PostalAddress[0].Country[0].IdentificationCode[0]._).toBe('CHN');
  });
  it('carries UTC date/time, currency, exchange rate and exact totals', () => {
    expect(inv.IssueDate[0]._).toBe('2026-10-24'); expect(inv.IssueTime[0]._).toBe('06:00:00Z');
    expect(inv.DocumentCurrencyCode[0]._).toBe('USD'); expect(inv.TaxExchangeRate[0].CalculationRate[0]._).toBe(4.2);
    expect(inv.LegalMonetaryTotal[0].PayableAmount[0]._).toBe(230);               // 20 x 5.50 + 10 x 12.00
    expect(inv.InvoiceLine).toHaveLength(2);
    expect(inv.InvoiceLine[0].LineExtensionAmount[0]._).toBe(110);
  });
});

describe('MyInvois connector', () => {
  it('is off without credentials and never calls fetch', async () => {
    const f = vi.fn();
    expect(myInvoisConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(await submitToMyInvois({}, 'X', {} as NodeJS.ProcessEnv, f as unknown as typeof fetch)).toMatchObject({ ok: false, detail: 'not_configured' });
    expect(f).not.toHaveBeenCalled();
  });
  it('hashes the exact base64-encoded JSON', () => {
    const p = packDocument({ a: 1 }, 'SB-1');
    expect(p.document).toBe(Buffer.from('{"a":1}').toString('base64'));
    expect(p.documentHash).toBe(createHash('sha256').update('{"a":1}').digest('hex'));
    expect(p.format).toBe('JSON');
  });
  it('gets a token then submits to the SANDBOX by default, and reports accepted / rejected documents', async () => {
    const calls: { url: string; init: any }[] = [];
    const f = vi.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      if (url.endsWith('/connect/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ submissionUid: 'UID1', acceptedDocuments: [{ uuid: 'U1', invoiceCodeNumber: 'SB-1' }], rejectedDocuments: [] }), { status: 202 });
    });
    const env = { MYINVOIS_CLIENT_ID: 'id', MYINVOIS_CLIENT_SECRET: 'sec' } as NodeJS.ProcessEnv;
    const r = await submitToMyInvois({ a: 1 }, 'SB-1', env, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, env: 'sandbox', submissionUid: 'UID1' });
    expect(calls[0].url).toBe('https://preprod-api.myinvois.hasil.gov.my/connect/token');
    expect(String(calls[0].init.body)).toContain('grant_type=client_credentials');
    expect(calls[1].url).toBe('https://preprod-api.myinvois.hasil.gov.my/api/v1.0/documentsubmissions');
    expect(calls[1].init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[1].init.body).documents[0]).toMatchObject({ format: 'JSON', codeNumber: 'SB-1' });
    const bad = await submitToMyInvois({}, 'SB-2', env, (async (u: string) => u.endsWith('/connect/token') ? new Response('{"access_token":"t"}') : new Response(JSON.stringify({ rejectedDocuments: [{ invoiceCodeNumber: 'SB-2', error: { message: 'bad' } }] }), { status: 202 })) as unknown as typeof fetch);
    expect(bad.ok).toBe(false); expect(bad.rejected?.[0].error?.message).toBe('bad');
  });
  it('uses production only when explicitly asked', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 401 }));
    const r = await submitToMyInvois({}, 'X', { MYINVOIS_CLIENT_ID: 'i', MYINVOIS_CLIENT_SECRET: 's', MYINVOIS_ENV: 'production' } as NodeJS.ProcessEnv, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, env: 'production', detail: 'token HTTP 401' });
    expect((f.mock.calls[0] as unknown[])[0]).toBe('https://api.myinvois.hasil.gov.my/connect/token');
  });
});
