import { getLlmBillingMetadata, llm } from '../src/llm';
import { MythosError } from '../src/errors';
import type { MythosSession } from '../src/types';

const SESSION: MythosSession = {
  userId: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  listingId: 'listing-abc',
  sessionJti: 'jti-001',
  llmIdentityToken: 'identity-token',
};

beforeEach(() => {
  process.env.MYTHOS_API_URL = 'https://api.mythos.work';
});

test('returns the fallback unchanged without a session', () => {
  const fallback = { answer: 'fallback' };

  expect(llm(null, { fallback })).toBe(fallback);
});

test('throws a typed error without a session or fallback', () => {
  expect(() => llm(null)).toThrow(MythosError);
  expect(() => llm(null)).toThrow(expect.objectContaining({ code: 'LLM_SESSION_REQUIRED' }));
});

test('configures the official client with provider auth and Mythos identity', async () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1,
        model: 'test-model',
        choices: [],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  global.fetch = fetchMock;

  const client = llm(SESSION, { apiKey: 'provider-key', timeout: 12_345 });
  await client.chat.completions.create({ model: 'test-model', messages: [] });

  const [input, init] = fetchMock.mock.calls[0] ?? [];
  expect(input).toBe('https://api.mythos.work/v1/chat/completions');
  const headers = new Headers(init?.headers);
  expect(headers.get('authorization')).toBe('Bearer provider-key');
  expect(headers.get('x-mythos-identity')).toBe('Bearer identity-token');
});

test('reads backend billing metadata from a completion', () => {
  expect(
    getLlmBillingMetadata({
       mythos_cost_microunits: '1234',
       mythos_pricing_source: 'rate_card',
       mythos_billing_status: 'settled',
       mythos_provider_cost_credits: 1,
       mythos_creator_margin_credits: 1,
       mythos_platform_fee_credits: 1,
       mythos_charge_credits: 3,
       mythos_creator_earning_credits: 0,
     }),
   ).toEqual({
     mythos_cost_microunits: '1234',
     mythos_pricing_source: 'rate_card',
     mythos_billing_status: 'settled',
     mythos_provider_cost_credits: 1,
     mythos_creator_margin_credits: 1,
     mythos_platform_fee_credits: 1,
     mythos_charge_credits: 3,
     mythos_creator_earning_credits: 0,
   });
  expect(getLlmBillingMetadata({ id: 'without-metadata' })).toBeNull();
});
