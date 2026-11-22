import { randomBytes } from 'crypto';
import { join } from 'path';

import { envFileName, fillEnv } from './env-file';
import { loadEnv } from './env-read';

const MIN_SECRET_LENGTH = 32;

export interface SecretOptions {
  cwd?: string;
  write?: (line: string) => void;
}

/** Fills an empty MYTHOS_SESSION_SECRET with 32 random bytes. Never overwrites a value, never prints one. */
export function secret(options: SecretOptions = {}): number {
  const cwd = options.cwd ?? process.cwd();
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const file = envFileName(cwd);
  // A secret already in any env file the app reads counts as set, so `.env.local` never overrides `.env`.
  let loaded: Record<string, string | undefined>;
  let written: string[];
  try {
    loaded = loadEnv(cwd, {});
    ({ written } = fillEnv(join(cwd, file), { MYTHOS_SESSION_SECRET: randomBytes(32).toString('base64') }, loaded));
  } catch (err) {
    write(`Could not write ${file} (${err instanceof Error ? err.message : String(err)}). `
      + 'Set MYTHOS_SESSION_SECRET yourself: openssl rand -base64 32');
    return 1;
  }
  if (written.length > 0) {
    write(`MYTHOS_SESSION_SECRET (generated) → ${file}`);
    return 0;
  }
  const existing = (loaded.MYTHOS_SESSION_SECRET ?? '').trim();
  if (existing.length < MIN_SECRET_LENGTH) {
    write(`MYTHOS_SESSION_SECRET is set but shorter than ${MIN_SECRET_LENGTH} characters, so the SDK will reject it. `
      + 'Delete its value and run this command again.');
    return 1;
  }
  write('MYTHOS_SESSION_SECRET already set; kept.');
  return 0;
}
