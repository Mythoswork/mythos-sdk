import { existsSync, readFileSync, writeFileSync } from 'fs';

import { detectFramework } from './doctor';
import { parseEnvValue } from './env-read';

export function envFileName(cwd: string): '.env.local' | '.env' {
  const framework = detectFramework(cwd);
  return framework === 'next-app' || framework === 'next-pages' ? '.env.local' : '.env';
}

/**
 * Writes each key that is absent or empty. Never overwrites a value: a key counts as set when it is
 * non-empty in this file or in `loaded` (every env file the app reads, plus the process env).
 */
export function fillEnv(
  path: string, values: Record<string, string>, loaded: Record<string, string | undefined> = {},
): { written: string[]; kept: string[] } {
  let content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const written: string[] = [];
  const kept: string[] = [];
  const appended: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^[ \\t]*${key}[ \\t]*=(.*)$`, 'm');
    const match = line.exec(content);
    if ((match && parseEnvValue(match[1]) !== '') || (loaded[key] ?? '').trim() !== '') {
      kept.push(key);
      continue;
    }
    if (match) content = content.replace(line, () => `${key}=${value}`);
    else appended.push(`${key}=${value}`);
    written.push(key);
  }
  if (appended.length > 0) {
    const separator = content && !content.endsWith('\n') ? '\n' : '';
    content = `${content}${separator}# Mythos\n${appended.join('\n')}\n`;
  }
  if (written.length > 0) writeFileSync(path, content, 'utf8');
  return { written, kept };
}

export function maskSecret(value: string): string {
  return value.length <= 8 ? '…' : `${value.slice(0, 3)}…${value.slice(-4)}`;
}
