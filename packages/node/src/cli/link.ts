import { execFileSync, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { join } from 'path';

import type { DoctorOptions } from './doctor';
import { envFileName, fillEnv, maskSecret } from './env-file';

export interface LinkOptions extends DoctorOptions {
  openBrowser?: (url: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** true = ignored, false = tracked by git, null = unknown (no git). */
  isGitIgnored?: (cwd: string, file: string) => boolean | null;
}

interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

interface Approval {
  mythosKey: string;
  listingId: string | null;
}

interface PollContext {
  fetch: typeof fetch;
  base: string;
  write: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const DEFAULT_API_URL = 'https://api.mythos.work';
const RATE_LIMIT_BACKOFF_MS = 5_000;
const FALLBACK = 'Until then, copy MYTHOS_KEY from Mythos dashboard → Settings → Mythos key, then run npx @mythos-work/sdk doctor.';

function defaultOpenBrowser(url: string): void {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => undefined); // ponytail: no browser (SSH, CI, agent sandbox) is fine; the URL is printed.
    child.unref();
  } catch {
    // Same as above.
  }
}

function defaultIsGitIgnored(cwd: string, file: string): boolean | null {
  try {
    execFileSync('git', ['check-ignore', '-q', file], { cwd, stdio: 'ignore' });
    return true;
  } catch (err) {
    return (err as { status?: number }).status === 1 ? false : null;
  }
}

async function post(fetchImpl: typeof fetch, url: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { data?: unknown } | null;
  return { status: response.status, data: payload?.data };
}

async function waitForApproval(ctx: PollContext, device: DeviceStart): Promise<Approval | null> {
  const deadline = ctx.now() + device.expiresIn * 1000;
  let delay = device.interval * 1000;
  for (;;) {
    await ctx.sleep(delay);
    if (ctx.now() > deadline) {
      ctx.write('Code expired. Run npx @mythos-work/sdk link again.');
      return null;
    }
    const { status, data } = await post(ctx.fetch, `${ctx.base}/api/cli/device/token`, { deviceCode: device.deviceCode });
    if (status === 200) return data as Approval;
    if (status === 202) continue;
    if (status === 429) {
      delay += RATE_LIMIT_BACKOFF_MS;
      continue;
    }
    ctx.write(status === 410
      ? 'Code expired or already used. Run npx @mythos-work/sdk link again.'
      : `Link failed (HTTP ${status}). ${FALLBACK}`);
    return null;
  }
}

function writeEnv(cwd: string, approval: Approval, base: string, write: (line: string) => void): string {
  const file = envFileName(cwd);
  const values: Record<string, string> = { MYTHOS_KEY: approval.mythosKey };
  if (approval.listingId) values.MYTHOS_LISTING_ID = approval.listingId;
  // A key from a non-production API only works against that API, so the app must point there too.
  if (base !== DEFAULT_API_URL) values.MYTHOS_API_URL = base;
  values.MYTHOS_SESSION_SECRET = randomBytes(32).toString('base64');
  const { written } = fillEnv(join(cwd, file), values);
  write(`Linked. ${file}:`);
  for (const key of Object.keys(values)) {
    if (!written.includes(key)) write(`  ${key} (kept existing)`);
    else if (key === 'MYTHOS_KEY') write(`  ${key}=${maskSecret(values[key])} (written)`);
    else if (key === 'MYTHOS_SESSION_SECRET') write(`  ${key} (generated)`);
    else write(`  ${key}=${values[key]} (written)`);
  }
  return file;
}

/** Device-code login: never prompts on stdin, so a coding agent can run it and relay the URL. */
export async function link(options: LinkOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const base = (env.MYTHOS_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');

  let approval: Approval | null;
  try {
    const start = await post(fetchImpl, `${base}/api/cli/device`, {});
    if (start.status !== 201) {
      write(start.status === 404
        ? `${base} does not support link yet (HTTP 404). ${FALLBACK}`
        : `${base} could not start link (HTTP ${start.status}). ${FALLBACK}`);
      return 1;
    }
    const device = start.data as DeviceStart;
    write(`Open ${device.verificationUrl} and confirm the code ${device.userCode}.`);
    write(`Waiting for approval (expires in ${Math.round(device.expiresIn / 60)} minutes)…`);
    (options.openBrowser ?? defaultOpenBrowser)(device.verificationUrl);
    approval = await waitForApproval({
      fetch: fetchImpl,
      base,
      write,
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      now: options.now ?? Date.now,
    }, device);
  } catch (err) {
    write(`Could not reach ${base} (${err instanceof Error ? err.message : String(err)}). Check MYTHOS_API_URL / network. ${FALLBACK}`);
    return 1;
  }
  if (!approval) return 1;

  const file = writeEnv(cwd, approval, base, write);
  if ((options.isGitIgnored ?? defaultIsGitIgnored)(cwd, file) === false) {
    write(`Warning: ${file} is not gitignored. Add it before committing.`);
  }
  write('Next: npx @mythos-work/sdk doctor');
  return 0;
}
