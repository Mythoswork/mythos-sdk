import { execFileSync, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { join } from 'path';

import type { DoctorOptions } from './doctor';
import { PRODUCER_KEY_PATTERN } from '../constants/producer-key.constants';
import { envFileName, fillEnv, maskSecret } from './env-file';
import { loadEnv } from './env-read';

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
/** Per-request cap, so a proxy holding a connection open cannot stall the CLI past its deadline. */
const REQUEST_TIMEOUT_MS = 15_000;
const FALLBACK = 'Until then, copy MYTHOS_KEY from Mythos dashboard → Settings → Mythos key, then run npx @mythos-work/sdk doctor.';

function defaultOpenBrowser(url: string): void {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => undefined);
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

class ProtocolError extends Error {}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

async function post(fetchImpl: typeof fetch, url: string, body: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<{ status: number; data: unknown }> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(1_000, Math.min(REQUEST_TIMEOUT_MS, timeoutMs))),
  });
  const payload = await response.json().catch(() => null) as { data?: unknown } | null;
  return { status: response.status, data: payload?.data };
}

function asDeviceStart(data: unknown): DeviceStart {
  const d = (data ?? {}) as Record<string, unknown>;
  const ok = typeof d.deviceCode === 'string' && d.deviceCode !== ''
    && typeof d.userCode === 'string' && d.userCode !== ''
    && typeof d.verificationUrl === 'string' && /^https?:\/\//.test(d.verificationUrl)
    && typeof d.expiresIn === 'number' && d.expiresIn > 0
    && typeof d.interval === 'number' && d.interval > 0;
  if (!ok) throw new ProtocolError('unexpected device response');
  return d as unknown as DeviceStart;
}

function asApproval(data: unknown): Approval {
  const d = (data ?? {}) as Record<string, unknown>;
  const ok = typeof d.mythosKey === 'string' && PRODUCER_KEY_PATTERN.test(d.mythosKey)
    && (d.listingId === null || (typeof d.listingId === 'string' && d.listingId !== ''));
  if (!ok) throw new ProtocolError('unexpected approval response');
  return { mythosKey: d.mythosKey as string, listingId: d.listingId as string | null };
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
    let result: { status: number; data: unknown };
    try {
      result = await post(ctx.fetch, `${ctx.base}/api/cli/device/token`, { deviceCode: device.deviceCode }, deadline - ctx.now());
    } catch (err) {
      if (isTimeout(err)) continue; // a hung request just means: poll again
      throw err;
    }
    if (result.status === 200) return asApproval(result.data);
    if (result.status === 202) continue;
    if (result.status === 429) {
      delay += RATE_LIMIT_BACKOFF_MS;
      continue;
    }
    ctx.write(result.status === 410
      ? 'Code expired or already used. Run npx @mythos-work/sdk link again.'
      : `Link failed (HTTP ${result.status}). ${FALLBACK}`);
    return null;
  }
}

/** Returns a message when the approved values would conflict with what the app already loads, else null. */
function conflictWith(env: Record<string, string | undefined>, approval: Approval): string | null {
  const existingKey = env.MYTHOS_KEY?.trim();
  if (existingKey && existingKey !== approval.mythosKey) {
    return `Your env already has a different MYTHOS_KEY (${maskSecret(existingKey)}) than the account you approved `
      + `(${maskSecret(approval.mythosKey)}). Nothing was written. Remove the old MYTHOS_KEY, or copy the right one from `
      + 'Mythos dashboard → Settings → Mythos key, then run npx @mythos-work/sdk link again.';
  }
  return null;
}

function writeEnv(cwd: string, env: Record<string, string | undefined>, approval: Approval, base: string, write: (line: string) => void): string {
  const file = envFileName(cwd);
  const values: Record<string, string> = { MYTHOS_KEY: approval.mythosKey };
  const listingIds = env.MYTHOS_LISTING_IDS?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
  const skipListing = approval.listingId !== null && listingIds.length > 0;
  if (approval.listingId && !skipListing) values.MYTHOS_LISTING_ID = approval.listingId;
  // A key from a non-production API only works against that API, so the app must point there too.
  if (base !== DEFAULT_API_URL) values.MYTHOS_API_URL = base;
  values.MYTHOS_SESSION_SECRET = randomBytes(32).toString('base64');
  // "Already set" means set in a file the app reads: a value given only on the command line (e.g.
  // MYTHOS_API_URL=… npx …) must still be written, or the app would not see it.
  const { written } = fillEnv(join(cwd, file), values, loadEnv(cwd, {}));
  write(`Linked. ${file}:`);
  for (const key of Object.keys(values)) {
    if (!written.includes(key)) write(`  ${key} (kept existing)`);
    else if (key === 'MYTHOS_KEY') write(`  ${key}=${maskSecret(values[key])} (written)`);
    else if (key === 'MYTHOS_SESSION_SECRET') write(`  ${key} (generated)`);
    else write(`  ${key}=${values[key]} (written)`);
  }
  if (skipListing && !listingIds.includes(approval.listingId!)) {
    write(`Warning: MYTHOS_LISTING_IDS is set, so MYTHOS_LISTING_ID would be ignored. Add ${approval.listingId} to MYTHOS_LISTING_IDS yourself.`);
  }
  return file;
}

/** Device-code login: never prompts on stdin, so a coding agent can run it and relay the URL. */
export async function link(options: LinkOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  // Read config the way the app and doctor do: .env, then .env.local, then the process env.
  const env = loadEnv(cwd, options.env ?? process.env);
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
    const device = asDeviceStart(start.data);
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
    write(err instanceof ProtocolError
      ? `${base} sent an unexpected response (${err.message}). ${FALLBACK}`
      : `Could not reach ${base} (${err instanceof Error ? err.message : String(err)}). Check MYTHOS_API_URL / network. ${FALLBACK}`);
    return 1;
  }
  if (!approval) return 1;

  const conflict = conflictWith(env, approval);
  if (conflict) {
    write(conflict);
    return 1;
  }
  let file: string;
  try {
    file = writeEnv(cwd, env, approval, base, write);
  } catch (err) {
    // The code is already used, so say exactly what to set by hand (never the full key).
    write(`Could not write ${envFileName(cwd)} (${err instanceof Error ? err.message : String(err)}). `
      + `Set MYTHOS_KEY from Mythos dashboard → Settings → Mythos key${approval.listingId ? ` and MYTHOS_LISTING_ID=${approval.listingId}` : ''}, `
      + 'run npx @mythos-work/sdk secret, then npx @mythos-work/sdk doctor.');
    return 1;
  }
  if ((options.isGitIgnored ?? defaultIsGitIgnored)(cwd, file) === false) {
    write(`Warning: ${file} is not gitignored. Add it before committing.`);
  }
  write('Next: npx @mythos-work/sdk doctor');
  return 0;
}
