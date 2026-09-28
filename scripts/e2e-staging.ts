/** Manual staging release gate. Run from packages/node after npm run build: npx tsx ../../scripts/e2e-staging.ts */
import { createMythos } from '../packages/node/dist';
import { refreshSession } from '../packages/node/dist/api-client';
import { openSession } from '../packages/node/dist/session';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function requireField(value: unknown, label: string): string {
  if (!nonempty(value)) throw new Error(`Missing ${label}`);
  return value;
}

function requireEnv(name: string): string {
  return requireField(process.env[name], name);
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function requireRecord(value: unknown, label: string): RecordValue {
  if (!record(value)) throw new Error(`Invalid ${label}`);
  return value;
}

async function api(path: string, token: string | null, method = 'GET', body?: RecordValue): Promise<RecordValue> {
  const response = await fetch(`${requireEnv('E2E_API_URL').replace(/\/+$/, '')}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const result: unknown = await response.json();
  const payload = requireRecord(result, path);
  if (payload.success !== true) throw new Error(`${path} was unsuccessful`);
  return payload;
}

async function step<T>(label: string, action: () => Promise<T>): Promise<T> {
  try {
    const result = await action();
    console.log(`✓ ${label}`);
    return result;
  } catch {
    // Never print an exception: SDK/network errors can include credential-bearing URLs or headers.
    console.error(`✗ ${label}`);
    throw new Error(`Staging gate failed at: ${label}`);
  }
}

async function main(): Promise<void> {
  const listing = requireEnv('E2E_LISTING_ID');
  const providerKey = requireEnv('E2E_PROVIDER_API_KEY');
  const platformFeePct = Number(process.env.E2E_PLATFORM_FEE_PCT || '20');
  if (!Number.isFinite(platformFeePct) || platformFeePct < 0) throw new Error('Invalid E2E_PLATFORM_FEE_PCT');
  const expectedFixed = 100 + Math.ceil(platformFeePct);
  requireEnv('MYTHOS_SESSION_SECRET');
  process.env.MYTHOS_LISTING_ID = listing;
  process.env.MYTHOS_API_URL = requireEnv('E2E_API_URL');

  const bearer = await step('Consumer login', async () => {
    const response = await api('/api/auth/login', null, 'POST', {
      email: requireEnv('E2E_CONSUMER_EMAIL'), password: requireEnv('E2E_CONSUMER_PASSWORD'),
    });
    // Current backend returns top-level token; accept the enveloped form too.
    return requireField(response.token ?? (record(response.data) ? response.data.token : undefined), 'login token');
  });
  const startBalance = await step('Starting wallet balance', async () => {
    const wallet = await api('/api/wallet', bearer);
    return requireNumber(wallet.total, 'wallet.total');
  });
  const beforeLedger = await step('Starting ledger snapshot', async () => {
    const ledger = await api('/api/wallet/ledger?limit=100', bearer);
    return new Set(requireEntries(ledger).map((entry) => requireField(entry.ledger_id, 'ledger_id')));
  });
  const launchToken = await step('Launch listing', async () => {
    const result = await api(`/api/apps/${encodeURIComponent(listing)}/launch`, bearer, 'POST', {});
    return requireField(requireRecord(result.data, 'launch data').launch_token, 'launch_token');
  });
  const mythos = createMythos();
  const { request, session } = await step('Consume launch and capture session cookie', async () => {
    const response = await mythos.handle(new Request(`https://e2e.local/api/mythos/session?lt=${encodeURIComponent(launchToken)}`));
    if (response.status !== 200) throw new Error('Session route failed');
    const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie?.startsWith('mythos_session=')) throw new Error('Session cookie missing');
    const sealed = cookie.slice('mythos_session='.length);
    const stored = openSession(sealed);
    if (!stored || !stored.llmIdentityToken) throw new Error('Session identity missing');
    return { request: new Request('https://e2e.local/action', { headers: { Cookie: cookie } }), session: stored };
  });
  const chargeId = await step('Charge 100 credits', async () => {
    const result = await mythos.charge(request, { credits: 100, reason: 'e2e' });
    return requireField(result.chargeId, 'chargeId');
  });
  const llmCharge = await step('Settle LLM completion', async () => {
    const client = await mythos.llm(request, { apiKey: providerKey });
    const completion = await client.chat.completions.create({ model: 'openai/gpt-4o-mini', max_tokens: 16,
      messages: [{ role: 'user', content: 'Say hello.' }] });
    const billing = mythos.billing(completion);
    if (billing?.mythos_billing_status !== 'settled') throw new Error('LLM billing not settled');
    const credits = requireNumber(billing.mythos_charge_credits, 'LLM charge credits');
    if (credits <= 0) throw new Error('LLM call was not billed');
    return credits;
  });
  await step('Refresh identity and verify absolute lifetime', async () => {
    const refreshed = await refreshSession(session.sessionJti, requireField(session.llmIdentityToken, 'identity token'));
    if (!refreshed || refreshed.llmIdentityToken === session.llmIdentityToken) throw new Error('Identity not refreshed');
    const remaining = Date.parse(refreshed.sessionExpiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining < 7 * 60 * 60 * 1000 || remaining > 8 * 60 * 60 * 1000) {
      throw new Error('Session lifetime is not approximately eight hours');
    }
  });
  await step('Verify ledger charges and wallet debit', async () => {
    const ledger = await api('/api/wallet/ledger?limit=100', bearer);
    const fresh = requireEntries(ledger).filter((entry) => !beforeLedger.has(entry.ledger_id as string));
    const charges = fresh.filter((entry) => entry.direction === 'debit' && entry.kind === 'metered_charge');
    const fixed = charges.filter((entry) => entry.reference_type === 'charge_id' && entry.reference_id === chargeId);
    const llm = charges.filter((entry) => entry.reference_type === 'llm_request');
    // Ledger debits are negative and can split between subscription and topup buckets.
    const sum = (entries: RecordValue[]): number => -entries.reduce((total, entry) => total + requireNumber(entry.amount, 'ledger amount'), 0);
    if (sum(fixed) !== expectedFixed || sum(llm) !== llmCharge) throw new Error('Missing fixed or LLM ledger debit');
    const wallet = await api('/api/wallet', bearer);
    if (startBalance - requireNumber(wallet.total, 'wallet.total') !== expectedFixed + llmCharge) {
      throw new Error('Wallet debit does not match charges');
    }
  });
}

function requireEntries(ledger: RecordValue): RecordValue[] {
  if (!Array.isArray(ledger.data)) throw new Error('Invalid ledger.data');
  return ledger.data.map((entry: unknown) => requireRecord(entry, 'ledger entry'));
}

void main().catch(() => { process.exitCode = 1; });
