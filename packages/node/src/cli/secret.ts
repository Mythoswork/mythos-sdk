import { randomBytes } from 'crypto';
import { join } from 'path';

import { envFileName, fillEnv } from './env-file';

export interface SecretOptions {
  cwd?: string;
  write?: (line: string) => void;
}

/** Fills an empty MYTHOS_SESSION_SECRET with 32 random bytes. Never overwrites a value. */
export function secret(options: SecretOptions = {}): number {
  const cwd = options.cwd ?? process.cwd();
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const file = envFileName(cwd);
  const { written } = fillEnv(join(cwd, file), { MYTHOS_SESSION_SECRET: randomBytes(32).toString('base64') });
  write(written.length > 0
    ? `MYTHOS_SESSION_SECRET (generated) → ${file}`
    : `MYTHOS_SESSION_SECRET already set in ${file}; kept.`);
  return 0;
}
