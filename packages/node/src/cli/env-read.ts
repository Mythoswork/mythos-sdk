import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** A raw `.env` value as Node dotenv reads it: quotes stripped; an unquoted value ends at the first `#`. */
export function parseEnvValue(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    const closingQuote = value.indexOf(value[0], 1);
    if (closingQuote >= 1) return value.slice(1, closingQuote);
  }
  return value.split('#')[0].trim();
}

export function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const separator = line.indexOf('=');
    values[line.slice(0, separator).trim()] = parseEnvValue(line.slice(separator + 1));
  }
  return values;
}

/** What the app sees: `.env`, then `.env.local`, then the process environment (each overriding the last). */
export function loadEnv(cwd: string, processEnv: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return {
    ...parseEnvFile(join(cwd, '.env')),
    ...parseEnvFile(join(cwd, '.env.local')),
    ...processEnv,
  };
}
