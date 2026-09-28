import { readFileSync } from 'fs';
import { join } from 'path';

import { meterSession, refreshSession } from '../src/api-client';
import { MythosError, MythosUpstreamError } from '../src/errors';
import { createMythos } from '../src/mythos';
import { openSession, sealSessionWithIv, type StoredSession } from '../src/session';
import { verifyLaunchToken } from '../src/verify';

jest.mock('../src/verify', () => ({ verifyLaunchToken: jest.fn() }));

const fixture = <T>(name: string): T => JSON.parse(
  readFileSync(join(__dirname, '../../../conformance', name), 'utf8'),
) as T;

interface ValidVector { name: string; iv_hex: string; payload: StoredSession; token: string }
interface InvalidVector { name: string; token: string }
interface SessionVectors { secret: string; valid: ValidVector[]; invalid: InvalidVector[] }
interface ErrorVector {
  endpoint: 'meter' | 'refresh' | 'consume'; status: number; code: string | null;
  expect: { code: string; httpStatus: number } | 'null';
}
interface ChargeFixture {
  input: { credits: number; reason: string; idempotencyKey: string };
  body: { credits: number; charge_id: string; reason: string };
}

const sessions = fixture<SessionVectors>('session-v1.json');
const errors = fixture<ErrorVector[]>('errors.json');
const charge = fixture<ChargeFixture>('charge-request.json');

beforeEach(() => {
  process.env.MYTHOS_SESSION_SECRET = sessions.secret;
  process.env.MYTHOS_LISTING_ID = 'listing-456';
  process.env.MYTHOS_API_URL = 'https://api.mythos.work';
  (global as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();
});

test.each(sessions.valid)('v1 vector $name seals and opens exactly', ({ payload, iv_hex, token }) => {
  expect(sealSessionWithIv(payload, Buffer.from(iv_hex, 'hex'))).toBe(token);
  expect(openSession(token)).toEqual(payload);
});

test.each(sessions.invalid)('v1 vector $name is rejected', ({ token }) => {
  expect(openSession(token)).toBeNull();
});

test.each(errors)('$endpoint maps HTTP $status / $code', async ({ endpoint, status, code, expect: expected }) => {
  const response = new Response(JSON.stringify(code === null ? {} : { code }), { status });
  const fetchMock = global.fetch as jest.Mock;
  fetchMock.mockResolvedValue(response);

  if (endpoint === 'consume') {
    (verifyLaunchToken as jest.Mock).mockResolvedValue(sessions.valid[0].payload);
    const result = await createMythos().handle(new Request('https://app.example/api/mythos/session?lt=launch'));
    const body = await result.json() as { code: string };
    if (expected === 'null') throw new Error('Consume fixture must specify an error');
    expect({ code: body.code, httpStatus: result.status }).toEqual(expected);
  } else {
    const operation = endpoint === 'meter'
      ? meterSession('session-789', 100, 'calc', charge.input.idempotencyKey)
      : refreshSession('session-789', 'identity.jwt.token');
    if (expected === 'null') {
      await expect(operation).resolves.toBeNull();
    } else {
      try {
        await operation;
        throw new Error('Expected an SDK error');
      } catch (error) {
        expect(error).toBeInstanceOf(MythosError);
        const mapped = error as MythosError;
        expect({ code: mapped.code, httpStatus: mapped.httpStatus }).toEqual(expected);
        if (mapped instanceof MythosUpstreamError && status !== 200) {
          expect(mapped.upstreamStatus).toBe(status);
          expect(mapped.upstreamCode).toBe(code ?? undefined);
        }
      }
    }
  }
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toContain(`/${endpoint}`);
});

test('meter request matches the shared charge body', async () => {
  const fetchMock = global.fetch as jest.Mock;
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
  await meterSession('session-789', charge.input.credits, charge.input.reason, charge.input.idempotencyKey);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toContain('/api/apps/sessions/session-789/meter');
  expect(JSON.parse(init.body as string)).toEqual(charge.body);
});
