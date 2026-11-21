import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { main } from '../src/cli';
import { secret } from '../src/cli/secret';

const fixtures: string[] = [];

function fixture(): string {
  const cwd = mkdtempSync(join(__dirname, '.mythos-secret-'));
  fixtures.push(cwd);
  return cwd;
}

afterEach(() => {
  for (const cwd of fixtures.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

test('fills an empty MYTHOS_SESSION_SECRET placeholder with 32 random bytes', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.env'), 'MYTHOS_SESSION_SECRET=\nOTHER=1\n');
  const output: string[] = [];
  expect(secret({ cwd, write: (line) => output.push(line) })).toBe(0);
  const value = readFileSync(join(cwd, '.env'), 'utf8').match(/^MYTHOS_SESSION_SECRET=(.+)$/m)![1];
  expect(Buffer.from(value, 'base64')).toHaveLength(32);
  expect(readFileSync(join(cwd, '.env'), 'utf8')).toContain('OTHER=1');
  expect(output.join('\n')).toContain('MYTHOS_SESSION_SECRET (generated) → .env');
  expect(output.join('\n')).not.toContain(value);
});

test('never overwrites an existing secret', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.env'), 'MYTHOS_SESSION_SECRET=keep-me-keep-me-keep-me-keep-me-keep\n');
  const output: string[] = [];
  secret({ cwd, write: (line) => output.push(line) });
  expect(readFileSync(join(cwd, '.env'), 'utf8')).toBe('MYTHOS_SESSION_SECRET=keep-me-keep-me-keep-me-keep-me-keep\n');
  expect(output).toEqual(['MYTHOS_SESSION_SECRET already set in .env; kept.']);
});

test('creates the env file for a non-Next project when none exists', () => {
  const cwd = fixture();
  secret({ cwd, write: () => undefined });
  expect(readFileSync(join(cwd, '.env'), 'utf8')).toMatch(/^# Mythos\nMYTHOS_SESSION_SECRET=/);
});

test('cli main routes secret', async () => {
  const cwd = fixture();
  const output: string[] = [];
  expect(await main(['secret'], { cwd, write: (line) => output.push(line) })).toBe(0);
  expect(output[0]).toContain('MYTHOS_SESSION_SECRET');
});
