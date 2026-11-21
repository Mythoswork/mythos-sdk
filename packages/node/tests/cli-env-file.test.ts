import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { envFileName, fillEnv, maskSecret } from '../src/cli/env-file';

const fixtures: string[] = [];

function fixture(): string {
  const cwd = mkdtempSync(join(__dirname, '.mythos-env-'));
  fixtures.push(cwd);
  return cwd;
}

afterEach(() => {
  for (const cwd of fixtures.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

test('fills an empty placeholder and keeps other lines', () => {
  const path = join(fixture(), '.env');
  writeFileSync(path, 'MYTHOS_KEY=\nOTHER=1\n');
  const result = fillEnv(path, { MYTHOS_KEY: 'mk_abcdef1234' });
  expect(readFileSync(path, 'utf8')).toBe('MYTHOS_KEY=mk_abcdef1234\nOTHER=1\n');
  expect(result).toEqual({ written: ['MYTHOS_KEY'], kept: [] });
});

test('keeps a non-empty value', () => {
  const path = join(fixture(), '.env');
  writeFileSync(path, 'MYTHOS_KEY=mk_old\n');
  const result = fillEnv(path, { MYTHOS_KEY: 'mk_new' });
  expect(readFileSync(path, 'utf8')).toBe('MYTHOS_KEY=mk_old\n');
  expect(result).toEqual({ written: [], kept: ['MYTHOS_KEY'] });
});

test('appends missing keys under a # Mythos header', () => {
  const path = join(fixture(), '.env');
  writeFileSync(path, 'OTHER=1');
  fillEnv(path, { MYTHOS_LISTING_ID: 'l1' });
  expect(readFileSync(path, 'utf8')).toBe('OTHER=1\n# Mythos\nMYTHOS_LISTING_ID=l1\n');
});

test('creates the file when absent', () => {
  const path = join(fixture(), '.env.local');
  fillEnv(path, { MYTHOS_KEY: 'mk_x' });
  expect(existsSync(path)).toBe(true);
  expect(readFileSync(path, 'utf8')).toBe('# Mythos\nMYTHOS_KEY=mk_x\n');
});

test('envFileName picks .env.local for Next.js and .env otherwise', () => {
  const next = fixture();
  writeFileSync(join(next, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0' } }));
  expect(envFileName(next)).toBe('.env.local');
  expect(envFileName(fixture())).toBe('.env');
});

test('maskSecret hides all but the prefix and last four characters', () => {
  expect(maskSecret('mk_abcdef1234')).toBe('mk_…1234');
  expect(maskSecret('short')).toBe('…');
});

test('treats quoted-empty and comment-only values as empty, like dotenv', () => {
  const path = join(fixture(), '.env');
  writeFileSync(path, 'MYTHOS_KEY=""\nMYTHOS_LISTING_ID= # paste here\n');
  const result = fillEnv(path, { MYTHOS_KEY: 'mk_x', MYTHOS_LISTING_ID: 'l1' });
  expect(result.written).toEqual(['MYTHOS_KEY', 'MYTHOS_LISTING_ID']);
  expect(readFileSync(path, 'utf8')).toBe('MYTHOS_KEY=mk_x\nMYTHOS_LISTING_ID=l1\n');
});

test('keeps a key that another loaded env file already sets', () => {
  const path = join(fixture(), '.env.local');
  const result = fillEnv(path, { MYTHOS_SESSION_SECRET: 'new' }, { MYTHOS_SESSION_SECRET: 'from-dot-env' });
  expect(result).toEqual({ written: [], kept: ['MYTHOS_SESSION_SECRET'] });
  expect(existsSync(path)).toBe(false);
});
