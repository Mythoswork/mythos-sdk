import { meterSession, refreshSession } from '../src/api-client';
import { InvalidUsageError, MythosUnreachableError, MythosUpstreamError, SessionExpiredError, SessionNotFoundError } from '../src/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  process.env.MYTHOS_LISTING_ID = 'listing-abc';
  process.env.MYTHOS_API_URL = 'https://api.mythos.work';
  (global as unknown as { fetch: jest.Mock }).fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

test('meterSession sends a fresh UUID charge_id on every call', async () => {
  await meterSession('jti-001', 5, 'page-view');
  await meterSession('jti-001', 5, 'page-view');

  const calls = (global.fetch as jest.Mock).mock.calls;
  const bodies = calls.map((c) => JSON.parse(c[1].body));

  expect(bodies[0].charge_id).toMatch(UUID_RE);
  expect(bodies[1].charge_id).toMatch(UUID_RE);
  expect(bodies[0].charge_id).not.toBe(bodies[1].charge_id);
  expect(bodies[0]).toMatchObject({ credits: 5, reason: 'page-view' });
});

test('meterSession uses provided idempotency key as charge_id', async () => {
  await meterSession('jti-001', 1, undefined, 'fixed-charge-id');

  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.charge_id).toBe('fixed-charge-id');
});

test('meterSession URL-encodes jti', async () => {
  await meterSession('jti/with/slashes', 1);

  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain('/api/apps/sessions/jti%2Fwith%2Fslashes/meter');
});

test('meterSession rejects non-positive credits', async () => {
  await expect(meterSession('jti-001', 0)).rejects.toBeInstanceOf(InvalidUsageError);
  await expect(meterSession('jti-001', -1)).rejects.toBeInstanceOf(InvalidUsageError);
});

test('meterSession reuses caller-supplied chargeId', async () => {
  await meterSession('jti-001', 5, 'page-view', 'stable-charge-key');
  await meterSession('jti-001', 5, 'page-view', 'stable-charge-key');

  const calls = (global.fetch as jest.Mock).mock.calls;
  const bodies = calls.map((c) => JSON.parse(c[1].body));

  expect(bodies[0].charge_id).toBe('stable-charge-key');
  expect(bodies[1].charge_id).toBe('stable-charge-key');
});

test('refreshSession posts identity header and parses a complete result', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({
    data: { llm_identity_token: 'new', llm_identity_expires_at: 'expiry', session_expires_at: 'absolute' },
  }) });
  await expect(refreshSession('jti/1', 'old')).resolves.toEqual({
    llmIdentityToken: 'new', llmIdentityExpiresAt: 'expiry', sessionExpiresAt: 'absolute',
  });
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain('/jti%2F1/refresh');
  expect(init.headers['X-Mythos-Identity']).toBe('Bearer old');
  expect(JSON.parse(init.body)).toEqual({});
});

test.each([{}, { data: {} }, { data: { llm_identity_token: 'x', session_expires_at: 'date' } }])(
  'refreshSession rejects malformed success %p', async (body) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
    await expect(refreshSession('j', 'old')).rejects.toMatchObject({
      message: 'Malformed refresh response', httpStatus: 502,
    });
  },
);

test.each([
  [404, undefined, null],
  [404, 'SESSION_NOT_FOUND', SessionNotFoundError],
  [401, 'INVALID_IDENTITY_TOKEN', SessionExpiredError],
  [403, 'FORBIDDEN', SessionExpiredError],
  [409, 'SESSION_NOT_STARTED', SessionExpiredError],
  [410, 'SESSION_EXPIRED', SessionExpiredError],
  [500, 'BROKEN', MythosUpstreamError],
])('refreshSession maps %i %s', async (status, code, expected) => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false, status, json: async () => code ? { code } : {},
  });
  if (expected === null) await expect(refreshSession('j', 'old')).resolves.toBeNull();
  else await expect(refreshSession('j', 'old')).rejects.toBeInstanceOf(expected);
});

test('refreshSession maps a network failure', async () => {
  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await expect(refreshSession('j', 'old')).rejects.toBeInstanceOf(MythosUnreachableError);
});
