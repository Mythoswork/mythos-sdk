import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { main } from '../src/cli';
import { link, type LinkOptions } from '../src/cli/link';

const fixtures: string[] = [];

function fixture(): string {
  const cwd = mkdtempSync(join(__dirname, '.mythos-link-'));
  fixtures.push(cwd);
  return cwd;
}

afterEach(() => {
  for (const cwd of fixtures.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

const DEVICE = {
  deviceCode: 'dev-code',
  userCode: 'BCDF-GHJK',
  verificationUrl: 'https://mythos.work/cli/approve?code=BCDF-GHJK',
  expiresIn: 600,
  interval: 5,
};

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

/** Device start answers `start`; token polls answer from `polls` in order, repeating the last. */
function api(start: Response, polls: Array<() => Response>): jest.MockedFunction<typeof fetch> {
  let poll = 0;
  return jest.fn(async (input) => {
    if (String(input).endsWith('/api/cli/device')) return start;
    const next = polls[Math.min(poll, polls.length - 1)];
    poll += 1;
    return next();
  });
}

function run(cwd: string, fetchMock: typeof fetch, extra: Partial<LinkOptions> = {}) {
  const output: string[] = [];
  const openBrowser = jest.fn();
  let clock = 0;
  const promise = link({
    cwd,
    env: { MYTHOS_API_URL: 'https://api.test' },
    fetch: fetchMock,
    write: (line) => output.push(line),
    openBrowser,
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
    isGitIgnored: () => true,
    ...extra,
  });
  return { promise, output, openBrowser };
}

const approved = (listingId: string | null) => () =>
  json(200, { success: true, data: { status: 'approved', mythosKey: 'mk_aaaaaaaaaaaaaaaaaaaaaaaaaaaa1234', listingId } });
const pending = () => json(202, { success: true, data: { status: 'pending' } });

test('link writes all three keys and prints only masked secrets', async () => {
  const cwd = fixture();
  const fetchMock = api(json(201, { success: true, data: DEVICE }), [pending, approved('l1')]);
  const { promise, output, openBrowser } = run(cwd, fetchMock);
  expect(await promise).toBe(0);
  const env = readFileSync(join(cwd, '.env'), 'utf8');
  expect(env).toContain('MYTHOS_KEY=mk_aaaaaaaaaaaaaaaaaaaaaaaaaaaa1234');
  expect(env).toContain('MYTHOS_LISTING_ID=l1');
  expect(env).toMatch(/MYTHOS_SESSION_SECRET=\S{32,}/);
  const printed = output.join('\n');
  expect(printed).toContain('BCDF-GHJK');
  expect(printed).toContain('mk_…1234');
  expect(printed).not.toContain('mk_aaaaaaaaaaaaaaaaaaaaaaaaaaaa1234');
  expect(printed).not.toContain(env.match(/MYTHOS_SESSION_SECRET=(\S+)/)![1]);
  expect(openBrowser).toHaveBeenCalledWith(DEVICE.verificationUrl);
  expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/cli/device/token', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ deviceCode: 'dev-code' }),
  }));
});

test('link fills init placeholders but keeps existing values', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.env'), 'MYTHOS_LISTING_ID=\nMYTHOS_SESSION_SECRET=keep-me\nMYTHOS_KEY=\n');
  const { promise, output } = run(cwd, api(json(201, { success: true, data: DEVICE }), [approved('l1')]));
  expect(await promise).toBe(0);
  expect(readFileSync(join(cwd, '.env'), 'utf8'))
    .toBe('MYTHOS_LISTING_ID=l1\nMYTHOS_SESSION_SECRET=keep-me\nMYTHOS_KEY=mk_aaaaaaaaaaaaaaaaaaaaaaaaaaaa1234\n# Mythos\nMYTHOS_API_URL=https://api.test\n');
  expect(output.join('\n')).toContain('MYTHOS_SESSION_SECRET (kept existing)');
});

test('link writes MYTHOS_API_URL only for a non-production API', async () => {
  const local = fixture();
  const { promise } = run(local, api(json(201, { success: true, data: DEVICE }), [approved('l1')]), {
    env: { MYTHOS_API_URL: 'http://localhost:5001/' },
  });
  expect(await promise).toBe(0);
  expect(readFileSync(join(local, '.env'), 'utf8')).toContain('MYTHOS_API_URL=http://localhost:5001\n');

  const prod = fixture();
  const { promise: prodRun } = run(prod, api(json(201, { success: true, data: DEVICE }), [approved('l1')]), { env: {} });
  expect(await prodRun).toBe(0);
  expect(readFileSync(join(prod, '.env'), 'utf8')).not.toContain('MYTHOS_API_URL');
});

test('link writes no listing ID for dynamic listings', async () => {
  const cwd = fixture();
  const { promise } = run(cwd, api(json(201, { success: true, data: DEVICE }), [approved(null)]));
  expect(await promise).toBe(0);
  expect(readFileSync(join(cwd, '.env'), 'utf8')).not.toContain('MYTHOS_LISTING_ID');
});

test('link stops at expiry', async () => {
  const cwd = fixture();
  const { promise, output } = run(cwd, api(json(201, { success: true, data: DEVICE }), [pending]));
  expect(await promise).toBe(1);
  expect(output.join('\n')).toContain('Code expired');
});

test('link backs off on 429 and still completes', async () => {
  const cwd = fixture();
  const sleeps: number[] = [];
  let clock = 0;
  const { promise } = run(cwd, api(json(201, { success: true, data: DEVICE }), [() => json(429, {}), approved('l1')]), {
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    now: () => clock,
  });
  expect(await promise).toBe(0);
  expect(sleeps).toEqual([5000, 10000]);
});

test('link falls back to the dashboard when the backend lacks the endpoint', async () => {
  const cwd = fixture();
  const { promise, output } = run(cwd, api(json(404, { success: false, error: 'Not found' }), [pending]));
  expect(await promise).toBe(1);
  expect(output.join('\n')).toContain('https://api.test does not support link yet (HTTP 404).');
  expect(output.join('\n')).toContain('Mythos dashboard → Settings → Mythos key');
});

test('link falls back to the dashboard when the network fails', async () => {
  const cwd = fixture();
  const fetchMock = jest.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  const { promise, output } = run(cwd, fetchMock);
  expect(await promise).toBe(1);
  expect(output.join('\n')).toContain('Could not reach https://api.test (fetch failed).');
});

test('link reports a used or expired code', async () => {
  const cwd = fixture();
  const { promise, output } = run(cwd, api(json(201, { success: true, data: DEVICE }), [() => json(410, {})]));
  expect(await promise).toBe(1);
  expect(output.join('\n')).toContain('Code expired or already used. Run npx @mythos-work/sdk link again.');
});

test('link warns when the env file is not gitignored', async () => {
  const cwd = fixture();
  const { promise, output } = run(cwd, api(json(201, { success: true, data: DEVICE }), [approved('l1')]), {
    isGitIgnored: () => false,
  });
  expect(await promise).toBe(0);
  expect(output.join('\n')).toContain('Warning: .env is not gitignored');
});

test('cli main routes link', async () => {
  const cwd = fixture();
  const output: string[] = [];
  const fetchMock = api(json(404, {}), [pending]);
  expect(await main(['link'], { cwd, env: {}, fetch: fetchMock, write: (line) => output.push(line) })).toBe(1);
  expect(fetchMock).toHaveBeenCalledWith('https://api.mythos.work/api/cli/device', expect.anything());
});

const KEY = `mk_${'a'.repeat(28)}1234`;
const startOk = () => json(201, { success: true, data: DEVICE });

test('link reads MYTHOS_API_URL from the env file, like the app and doctor', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.env'), 'MYTHOS_API_URL=https://staging.test\n');
  const fetchMock = api(startOk(), [approved('l1')]);
  const { promise } = run(cwd, fetchMock, { env: {} });
  expect(await promise).toBe(0);
  expect(String(fetchMock.mock.calls[0][0])).toBe('https://staging.test/api/cli/device');
});

test('link writes nothing when the env already has a different MYTHOS_KEY', async () => {
  const cwd = fixture();
  const other = `mk_${'b'.repeat(32)}`;
  writeFileSync(join(cwd, '.env'), `MYTHOS_KEY=${other}\n`);
  const { promise, output } = run(cwd, api(startOk(), [approved('l1')]));
  expect(await promise).toBe(1);
  expect(readFileSync(join(cwd, '.env'), 'utf8')).toBe(`MYTHOS_KEY=${other}\n`);
  expect(output.join('\n')).toContain('different MYTHOS_KEY');
  expect(output.join('\n')).not.toContain(other);
});

test('link carries on when the existing MYTHOS_KEY matches the approved one', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.env'), `MYTHOS_KEY=${KEY}\n`);
  const { promise } = run(cwd, api(startOk(), [approved('l1')]));
  expect(await promise).toBe(0);
  expect(readFileSync(join(cwd, '.env'), 'utf8')).toContain('MYTHOS_LISTING_ID=l1');
});

test('link does not write MYTHOS_LISTING_ID when MYTHOS_LISTING_IDS is set', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.env'), 'MYTHOS_LISTING_IDS=other\n');
  const { promise, output } = run(cwd, api(startOk(), [approved('l1')]));
  expect(await promise).toBe(0);
  expect(readFileSync(join(cwd, '.env'), 'utf8')).not.toContain('MYTHOS_LISTING_ID=');
  expect(output.join('\n')).toContain('Add l1 to MYTHOS_LISTING_IDS yourself');
});

test('link keeps a value set in .env instead of overriding it in .env.local (Next.js)', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0' } }));
  writeFileSync(join(cwd, '.env'), 'MYTHOS_SESSION_SECRET=existing-secret-existing-secret-xx\n');
  const { promise, output } = run(cwd, api(startOk(), [approved('l1')]));
  expect(await promise).toBe(0);
  expect(readFileSync(join(cwd, '.env.local'), 'utf8')).not.toContain('MYTHOS_SESSION_SECRET');
  expect(output.join('\n')).toContain('MYTHOS_SESSION_SECRET (kept existing)');
});

test('link reports a protocol error for a malformed start response and does not poll', async () => {
  const cwd = fixture();
  const fetchMock = api(json(201, { success: true, data: { deviceCode: 'x' } }), [pending]);
  const { promise, output } = run(cwd, fetchMock);
  expect(await promise).toBe(1);
  expect(output.join('\n')).toContain('sent an unexpected response');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('link reports a protocol error for a malformed approval and writes nothing', async () => {
  const cwd = fixture();
  const { promise, output } = run(cwd, api(startOk(), [() => json(200, { success: true, data: { status: 'approved' } })]));
  expect(await promise).toBe(1);
  expect(output.join('\n')).toContain('sent an unexpected response');
  expect(existsSync(join(cwd, '.env'))).toBe(false);
});

test('link keeps polling after a request times out', async () => {
  const cwd = fixture();
  const timeout = () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); };
  const { promise } = run(cwd, api(startOk(), [timeout, approved('l1')]));
  expect(await promise).toBe(0);
});

test('link explains a failed env write instead of crashing', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.env'), 'OTHER=1\n');
  chmodSync(join(cwd, '.env'), 0o444);
  try {
    const { promise, output } = run(cwd, api(startOk(), [approved('l1')]));
    expect(await promise).toBe(1);
    expect(output.join('\n')).toContain('Could not write .env');
    expect(output.join('\n')).toContain('MYTHOS_LISTING_ID=l1');
    expect(output.join('\n')).not.toContain(KEY);
  } finally {
    chmodSync(join(cwd, '.env'), 0o644);
  }
});
