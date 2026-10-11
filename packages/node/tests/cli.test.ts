import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { main, USAGE } from '../src/cli';
import { agents } from '../src/cli/agents';
import { doctor } from '../src/cli/doctor';
import { init } from '../src/cli/init';
import { MISSING_PRODUCER_KEY_WARNING } from '../src/constants/producer-key.constants';

const VALID_ENV = {
  MYTHOS_SESSION_SECRET: 's'.repeat(32),
  MYTHOS_LISTING_ID: 'listing-1',
};

const fixtures: string[] = [];

function fixture(): string {
  const cwd = mkdtempSync(join(__dirname, '.mythos-cli-'));
  fixtures.push(cwd);
  return cwd;
}

afterEach(() => {
  for (const cwd of fixtures.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function successfulFetch(): jest.MockedFunction<typeof fetch> {
  return jest.fn(async (input) => String(input).includes('/run-info')
    ? jsonResponse(200, { success: true, data: { title: 'Calc' } })
    : jsonResponse(200, { keys: [{}] }));
}

function installSdk(cwd: string): void {
  const directory = join(cwd, 'node_modules', '@mythos-work', 'sdk');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '0.2.0' }));
}

function wireExpress(cwd: string): void {
  writeFileSync(join(cwd, 'server.ts'), 'app.use(mythosExpress(mythos));');
}

test('init scaffolds a Next.js App Router project and preserves existing files', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0' } }));
  mkdirSync(join(cwd, 'app'));
  const output: string[] = [];

  await init({ cwd, env: {}, fetch: successfulFetch(), write: output.push.bind(output) });

  const libraryPath = join(cwd, 'lib', 'mythos.ts');
  expect(readFileSync(libraryPath, 'utf8')).toContain('createMythos()');
  expect(readFileSync(join(cwd, 'app', 'api', 'mythos', '[...mythos]', 'route.ts'), 'utf8'))
    .toContain("from '../../../../lib/mythos'");
  const env = readFileSync(join(cwd, '.env.local'), 'utf8');
  expect(env).toContain('MYTHOS_LISTING_ID=');
  expect(env).toContain('# copy from Mythos dashboard → Settings → Mythos key\nMYTHOS_KEY=\n');
  expect(env.match(/MYTHOS_SESSION_SECRET=(.+)/)?.[1].length).toBeGreaterThanOrEqual(32);

  writeFileSync(libraryPath, '// keep me\n');
  await init({ cwd, env: {}, fetch: successfulFetch(), write: output.push.bind(output) });
  expect(readFileSync(libraryPath, 'utf8')).toBe('// keep me\n');
  expect(output).toContain('! exists, skipped: lib/mythos.ts');
});

test.each([
  ['next-pages', { dependencies: { next: '15.0.0' } }, 'pages/api/mythos/[...mythos].ts'],
  ['express-ts', { dependencies: { express: '4.0.0' } }, 'mythos.ts'],
] as const)('init scaffolds %s', async (_name, packageJson, expectedPath) => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(packageJson));
  if (expectedPath === 'mythos.ts') writeFileSync(join(cwd, 'tsconfig.json'), '{}');

  await init({ cwd, env: {}, fetch: successfulFetch(), write: jest.fn() });

  expect(readFileSync(join(cwd, expectedPath), 'utf8')).toBeTruthy();
});

test('init scaffolds JavaScript Express and FastAPI projects', async () => {
  const expressCwd = fixture();
  writeFileSync(join(expressCwd, 'package.json'), JSON.stringify({ dependencies: { express: '4.0.0' } }));
  await init({ cwd: expressCwd, env: {}, fetch: successfulFetch(), write: jest.fn() });
  expect(readFileSync(join(expressCwd, 'mythos.js'), 'utf8')).toContain('module.exports = { mythos }');

  const fastapiCwd = fixture();
  writeFileSync(join(fastapiCwd, 'pyproject.toml'), 'dependencies = ["fastapi"]');
  await init({ cwd: fastapiCwd, env: {}, fetch: successfulFetch(), write: jest.fn() });
  expect(readFileSync(join(fastapiCwd, 'mythos_setup.py'), 'utf8')).toBe('from mythos_sdk import create_mythos\n\nmythos = create_mythos()\n');
});

test('init scaffolds ESM syntax for a module-based Express project', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ type: 'module', dependencies: { express: '4.0.0' } }));

  await init({ cwd, env: {}, fetch: successfulFetch(), write: jest.fn() });

  expect(readFileSync(join(cwd, 'mythos.js'), 'utf8')).toContain("import { createMythos }");
  expect(readFileSync(join(cwd, 'mythos.js'), 'utf8')).toContain('export const mythos');
});

test('doctor does not require the Node SDK in a mixed FastAPI project', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { react: '19.0.0' } }));
  writeFileSync(join(cwd, 'pyproject.toml'), 'dependencies = ["fastapi"]');
  writeFileSync(join(cwd, 'mythos_setup.py'), 'from mythos_sdk import create_mythos\nmythos = create_mythos()');
  writeFileSync(join(cwd, 'main.py'), 'app.include_router(mythos.router)');

  const output: string[] = [];
  const result = await doctor({ cwd, env: VALID_ENV, fetch: successfulFetch(), write: output.push.bind(output) });

  expect(result).toBe(0);
  expect(output.join('\n')).not.toContain('@mythos-work/sdk is missing');
});

test('doctor redacts API URL credentials from output', async () => {
  const output: string[] = [];
  await doctor({
    cwd: validExpressProject(),
    env: { ...VALID_ENV, MYTHOS_API_URL: 'https://user:secret@api.mythos.work?token=hidden' },
    fetch: successfulFetch(),
    write: output.push.bind(output),
  });

  expect(output.join('\n')).not.toContain('secret');
  expect(output.join('\n')).not.toContain('hidden');
});

test('doctor rejects an explicitly empty API URL', async () => {
  const output: string[] = [];
  const fetchStub = successfulFetch();

  const result = await doctor({
    cwd: validExpressProject(),
    env: { ...VALID_ENV, MYTHOS_API_URL: '' },
    fetch: fetchStub,
    write: output.push.bind(output),
  });

  expect(result).toBe(1);
  expect(output).toContain('MYTHOS_API_URL must be an http(s) URL');
  expect(fetchStub).not.toHaveBeenCalled();
});

test('init rejects an unknown project', async () => {
  const output: string[] = [];
  expect(await init({ cwd: fixture(), env: {}, fetch: successfulFetch(), write: output.push.bind(output) })).toBe(1);
  expect(output.join('\n')).toContain('Supported: Next.js App Router, Next.js Pages Router, Express, FastAPI');
});

function validExpressProject(): string {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { express: '4.0.0' } }));
  wireExpress(cwd);
  installSdk(cwd);
  return cwd;
}

test('doctor passes all checks in order', async () => {
  const cwd = validExpressProject();
  const output: string[] = [];

  const result = await doctor({ cwd, env: VALID_ENV, fetch: successfulFetch(), write: output.push.bind(output) });

  expect(result).toBe(0);
  expect(output).toEqual([
    `⚠ ${MISSING_PRODUCER_KEY_WARNING}`,
    '✔ MYTHOS_SESSION_SECRET is set',
    '✔ MYTHOS_SESSION_SECRET is at least 32 chars',
    '✔ 1 Mythos listing ID(s) configured',
    '✔ MYTHOS_API_URL is valid (https://api.mythos.work)',
    '✔ API reachable (https://api.mythos.work)',
    '✔ Listing listing-1: Calc',
    '✔ Mythos route is wired',
    '✔ @mythos-work/sdk 0.2.0 is installed',
    '8 passed, 0 failed',
  ]);
});

test('doctor fails a short secret', async () => {
  const output: string[] = [];
  const result = await doctor({
    cwd: validExpressProject(),
    env: { ...VALID_ENV, MYTHOS_SESSION_SECRET: 'twelve-chars' },
    fetch: successfulFetch(),
    write: output.push.bind(output),
  });
  expect(result).toBe(1);
  expect(output.join('\n')).toContain('MYTHOS_SESSION_SECRET is 12 chars; regenerate with openssl rand -base64 32');
});

test('doctor reports an unpublished listing', async () => {
  const output: string[] = [];
  const fetchStub = jest.fn(async (input) => String(input).includes('/run-info')
    ? jsonResponse(404, { error: 'not found' })
    : jsonResponse(200, { keys: [{}] })) as jest.MockedFunction<typeof fetch>;
  expect(await doctor({ cwd: validExpressProject(), env: VALID_ENV, fetch: fetchStub, write: output.push.bind(output) })).toBe(1);
  expect(output.join('\n')).toContain('Listing listing-1 not found or not published');
});

test('doctor skips listing checks after a JWKS network error', async () => {
  const output: string[] = [];
  const fetchStub = jest.fn(async (_input: Parameters<typeof fetch>[0]) => {
    throw new Error('connection refused');
  }) as jest.MockedFunction<typeof fetch>;
  expect(await doctor({ cwd: validExpressProject(), env: VALID_ENV, fetch: fetchStub, write: output.push.bind(output) })).toBe(1);
  expect(output).toContain('- skipped');
  expect(output.join('\n')).toContain('Cannot reach https://api.mythos.work (connection refused)');
  expect(fetchStub).toHaveBeenCalledTimes(1);
});

test('doctor parses env files with quotes, comments and process precedence', async () => {
  const cwd = validExpressProject();
  writeFileSync(join(cwd, '.env.local'), `# local\nMYTHOS_SESSION_SECRET='${'l'.repeat(32)}'\nMYTHOS_LISTING_ID=local-id\n`);
  writeFileSync(join(cwd, '.env'), 'MYTHOS_SESSION_SECRET="short"\nMYTHOS_LISTING_ID=env-id\n');
  const output: string[] = [];

  expect(await doctor({ cwd, env: { MYTHOS_LISTING_ID: 'process-id' }, fetch: successfulFetch(), write: output.push.bind(output) })).toBe(0);
  expect(output).toContain('✔ Listing process-id: Calc');
});

test('CLI help and unknown-command exit semantics', async () => {
  const output: string[] = [];
  expect(await main(['--help'], { write: output.push.bind(output) })).toBe(0);
  expect(await main(['unknown'], { write: output.push.bind(output) })).toBe(2);
  expect(output).toEqual([USAGE, USAGE]);
});

test('agents installs skills for every agent and a single AGENTS.md pointer', async () => {
  const cwd = fixture();
  const output: string[] = [];

  expect(await main(['agents'], { cwd, write: output.push.bind(output) })).toBe(0);

  for (const directory of ['.agents', '.claude', '.cursor']) {
    expect(readFileSync(join(cwd, directory, 'skills', 'integrate-mythos-sdk', 'SKILL.md'), 'utf8'))
      .toContain('name: integrate-mythos-sdk');
  }
  expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toContain('<!-- mythos-sdk -->');

  const editedSkill = join(cwd, '.claude', 'skills', 'integrate-mythos-sdk', 'SKILL.md');
  writeFileSync(editedSkill, 'custom');
  await main(['agents'], { cwd, write: output.push.bind(output) });
  expect(readFileSync(editedSkill, 'utf8')).toBe('custom');
  expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8').split('<!-- mythos-sdk -->')).toHaveLength(2);
});

test('agents appends to an existing AGENTS.md without losing content', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'AGENTS.md'), '# House rules\nUse tabs.');

  expect(agents({ cwd, write: () => undefined })).toBe(0);

  const content = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
  expect(content.startsWith('# House rules\nUse tabs.\n\n<!-- mythos-sdk -->')).toBe(true);
});

test('doctor warns when Express config lives only in .env', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { express: '4.0.0' } }));
  writeFileSync(join(cwd, '.env'), `MYTHOS_SESSION_SECRET=${'s'.repeat(32)}\nMYTHOS_LISTING_ID=listing-1\n`);
  const output: string[] = [];

  await doctor({ cwd, env: {}, fetch: successfulFetch(), write: output.push.bind(output) });
  expect(output.some((line) => line.includes('found only in .env'))).toBe(true);

  const exported: string[] = [];
  await doctor({ cwd, env: VALID_ENV, fetch: successfulFetch(), write: exported.push.bind(exported) });
  expect(exported.some((line) => line.includes('found only in .env'))).toBe(false);
});

test('doctor does not warn about .env files for Next.js, which loads them itself', async () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0' } }));
  writeFileSync(join(cwd, '.env.local'), `MYTHOS_SESSION_SECRET=${'s'.repeat(32)}\n`);
  const output: string[] = [];

  await doctor({ cwd, env: {}, fetch: successfulFetch(), write: output.push.bind(output) });
  expect(output.some((line) => line.includes('found only in .env'))).toBe(false);
});

test.each([
  [undefined, `⚠ ${MISSING_PRODUCER_KEY_WARNING}`, 0],
  ['  ', `⚠ ${MISSING_PRODUCER_KEY_WARNING}`, 0],
  [`mk_${'a'.repeat(32)}`, '✔ MYTHOS_KEY is set', 0],
  [`  mk_${'a'.repeat(32)}  `, '✔ MYTHOS_KEY is set', 0],
  ['foo', '✖ MYTHOS_KEY is malformed', 1],
])('doctor reports key state without disclosing the value: %s', async (key, expected, status) => {
  const output: string[] = [];
  const result = await doctor({
    cwd: validExpressProject(), env: { ...VALID_ENV, MYTHOS_KEY: key },
    fetch: successfulFetch(), write: output.push.bind(output),
  });
  expect(result).toBe(status);
  expect(output).toContain(expected);
  if (key?.trim()) expect(output.join('\n')).not.toContain(key.trim());
});

test.each([
  ['next-app', { dependencies: { next: '15.0.0' } }, '.env.local'],
  ['next-pages', { dependencies: { next: '15.0.0' } }, '.env.local'],
  ['express-js', { dependencies: { express: '4.0.0' } }, '.env'],
  ['express-ts', { dependencies: { express: '4.0.0' } }, '.env'],
  ['fastapi', {}, '.env'],
] as const)('init %s adds the key placeholder once; doctor reads it as missing', async (framework, packageJson, envFile) => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(packageJson));
  if (framework === 'next-app') mkdirSync(join(cwd, 'app'));
  if (framework === 'express-ts') writeFileSync(join(cwd, 'tsconfig.json'), '{}');
  if (framework === 'fastapi') writeFileSync(join(cwd, 'pyproject.toml'), 'dependencies = ["fastapi"]');
  const envPath = join(cwd, envFile);
  const original = `MYTHOS_SESSION_SECRET=${'s'.repeat(32)}\nMYTHOS_LISTING_ID=listing-1\n# keep this\n`;
  writeFileSync(envPath, original);
  await init({ cwd, env: {}, fetch: successfulFetch(), write: jest.fn() });
  const content = readFileSync(envPath, 'utf8');
  expect(content.startsWith(original)).toBe(true);
  expect(content).toContain('# copy from Mythos dashboard → Settings → Mythos key\nMYTHOS_KEY=\n');
  await init({ cwd, env: {}, fetch: successfulFetch(), write: jest.fn() });
  expect(readFileSync(envPath, 'utf8')).toBe(content);
  const output: string[] = [];
  await doctor({ cwd, env: {}, fetch: successfulFetch(), write: output.push.bind(output) });
  expect(output).toContain(`⚠ ${MISSING_PRODUCER_KEY_WARNING}`);
  expect(output).not.toContain('✖ MYTHOS_KEY is malformed');
});

test('init preserves an existing key and doctor respects process precedence over commented env values', async () => {
  const cwd = validExpressProject();
  const key = `mk_${'b'.repeat(32)}`;
  const content = `MYTHOS_SESSION_SECRET=${'s'.repeat(32)}\nMYTHOS_LISTING_ID=listing-1\nMYTHOS_KEY="${key}" # dashboard\n`;
  writeFileSync(join(cwd, '.env'), content);
  await init({ cwd, env: {}, fetch: successfulFetch(), write: jest.fn() });
  expect(readFileSync(join(cwd, '.env'), 'utf8')).toBe(content);
  const fromFile: string[] = [];
  expect(await doctor({ cwd, env: {}, fetch: successfulFetch(), write: fromFile.push.bind(fromFile) })).toBe(0);
  expect(fromFile).toContain('✔ MYTHOS_KEY is set');
  expect(fromFile.join('\n')).not.toContain(key);
  const overridden: string[] = [];
  expect(await doctor({ cwd, env: { ...VALID_ENV, MYTHOS_KEY: '' }, fetch: successfulFetch(), write: overridden.push.bind(overridden) })).toBe(0);
  expect(overridden).toContain(`⚠ ${MISSING_PRODUCER_KEY_WARNING}`);
});
