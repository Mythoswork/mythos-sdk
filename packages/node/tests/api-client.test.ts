import { meterSession } from '../src/api-client';
import { InvalidUsageError } from '../src/errors';

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
