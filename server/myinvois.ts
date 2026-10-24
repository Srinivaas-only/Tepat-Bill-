// MyInvois (LHDN) submission. OFF unless MYINVOIS_CLIENT_ID + MYINVOIS_CLIENT_SECRET are set. Default environment is the SANDBOX (preprod);
// production needs MYINVOIS_ENV=production on purpose. Request shapes follow the MyInvois SDK as recalled by our research and are
// checked against a fake fetch in tests; the LHDN sandbox is the final judge.
import { createHash } from 'node:crypto';

export const myInvoisBase = (env: NodeJS.ProcessEnv = process.env) => env.MYINVOIS_ENV === 'production' ? 'https://api.myinvois.hasil.gov.my' : 'https://preprod-api.myinvois.hasil.gov.my';
export const myInvoisConfigured = (env: NodeJS.ProcessEnv = process.env) => !!(env.MYINVOIS_CLIENT_ID?.trim() && env.MYINVOIS_CLIENT_SECRET?.trim());

export interface MyInvoisResult { ok: boolean; env: 'sandbox' | 'production'; submissionUid?: string; accepted?: { uuid: string; invoiceCodeNumber: string }[]; rejected?: { invoiceCodeNumber: string; error?: { code?: string; message?: string } }[]; detail: string }

/** documentHash = SHA-256 hex of the exact minified JSON that is base64-encoded into `document`. */
export function packDocument(doc: unknown, codeNumber: string) {
  const json = JSON.stringify(doc);
  return { format: 'JSON', documentHash: createHash('sha256').update(json, 'utf8').digest('hex'), codeNumber, document: Buffer.from(json, 'utf8').toString('base64') };
}

export async function submitToMyInvois(doc: unknown, codeNumber: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<MyInvoisResult> {
  const mode = env.MYINVOIS_ENV === 'production' ? 'production' : 'sandbox';
  if (!myInvoisConfigured(env)) return { ok: false, env: mode, detail: 'not_configured' };
  const base = myInvoisBase(env);
  try {
    const tokenRes = await fetchImpl(`${base}/connect/token`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(env.MYINVOIS_ONBEHALFOF ? { onbehalfof: env.MYINVOIS_ONBEHALFOF } : {}) },
      body: new URLSearchParams({ client_id: env.MYINVOIS_CLIENT_ID!.trim(), client_secret: env.MYINVOIS_CLIENT_SECRET!.trim(), grant_type: 'client_credentials', scope: 'InvoicingAPI' }).toString() });
    if (!tokenRes.ok) return { ok: false, env: mode, detail: `token HTTP ${tokenRes.status}` };
    const { access_token } = await tokenRes.json() as { access_token?: string };
    if (!access_token) return { ok: false, env: mode, detail: 'token missing' };
    const res = await fetchImpl(`${base}/api/v1.0/documentsubmissions`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access_token}`, ...(env.MYINVOIS_ONBEHALFOF ? { onbehalfof: env.MYINVOIS_ONBEHALFOF } : {}) },
      body: JSON.stringify({ documents: [packDocument(doc, codeNumber)] }) });
    const body = await res.json().catch(() => ({})) as { submissionUid?: string; acceptedDocuments?: { uuid: string; invoiceCodeNumber: string }[]; rejectedDocuments?: { invoiceCodeNumber: string; error?: { code?: string; message?: string } }[] };
    const accepted = body.acceptedDocuments ?? [], rejected = body.rejectedDocuments ?? [];
    return { ok: res.ok && accepted.length > 0 && rejected.length === 0, env: mode, submissionUid: body.submissionUid, accepted, rejected, detail: `HTTP ${res.status}` };
  } catch (e) { return { ok: false, env: mode, detail: (e as Error).message }; }
}
