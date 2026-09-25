import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export type Framework = 'next-app' | 'next-pages' | 'express' | 'fastapi' | null;

export interface DoctorOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  write?: (line: string) => void;
}

const DEFAULT_API_URL = 'https://api.mythos.work';

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const separator = line.indexOf('=');
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

function loadEnv(cwd: string, processEnv: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return {
    ...parseEnvFile(join(cwd, '.env')),
    ...parseEnvFile(join(cwd, '.env.local')),
    ...processEnv,
  };
}

const REQUIRED_ENV = ['MYTHOS_SESSION_SECRET', 'MYTHOS_LISTING_ID', 'MYTHOS_LISTING_IDS'];

// Next.js loads .env files itself; Express/FastAPI servers only see what the start command exports.
function isOnlyInEnvFile(cwd: string, processEnv: NodeJS.ProcessEnv): boolean {
  const fileEnv = { ...parseEnvFile(join(cwd, '.env')), ...parseEnvFile(join(cwd, '.env.local')) };
  return REQUIRED_ENV.some((key) => fileEnv[key] && !processEnv[key]);
}

function readPackage(cwd: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasDependency(packageJson: Record<string, unknown>, name: string): boolean {
  const dependencies = packageJson.dependencies as Record<string, unknown> | undefined;
  const devDependencies = packageJson.devDependencies as Record<string, unknown> | undefined;
  return Boolean(dependencies?.[name] || devDependencies?.[name]);
}

export function detectFramework(cwd: string): Framework {
  const packageJson = readPackage(cwd);
  if (packageJson && hasDependency(packageJson, 'next')) {
    return existsSync(join(cwd, 'app')) || existsSync(join(cwd, 'src', 'app')) ? 'next-app' : 'next-pages';
  }
  if (packageJson && hasDependency(packageJson, 'express')) return 'express';
  for (const filename of ['pyproject.toml', 'requirements.txt']) {
    const path = join(cwd, filename);
    if (existsSync(path) && /\bfastapi\b/i.test(readFileSync(path, 'utf8'))) return 'fastapi';
  }
  return null;
}

function filesAtDepth(cwd: string, extensions: Set<string>, excluded: Set<string>, maxDepth = 3): string[] {
  const files: string[] = [];
  const visit = (directory: string, depth: number): void => {
    if (depth > maxDepth) return;
    for (const entry of readdirSync(directory)) {
      if (excluded.has(entry)) continue;
      const path = join(directory, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path, depth + 1);
      else if (extensions.has(entry.slice(entry.lastIndexOf('.')))) files.push(path);
    }
  };
  visit(cwd, 0);
  return files;
}

function isRouteWired(cwd: string, framework: Framework): boolean {
  if (framework === 'next-app') {
    return ['app', join('src', 'app')].some((root) => ['ts', 'js'].some((extension) =>
      existsSync(join(cwd, root, 'api', 'mythos', '[...mythos]', `route.${extension}`))));
  }
  if (framework === 'next-pages') {
    return ['pages', join('src', 'pages')].some((root) => ['ts', 'js'].some((extension) =>
      existsSync(join(cwd, root, 'api', 'mythos', `[...mythos].${extension}`))));
  }
  if (framework === 'express') {
    return filesAtDepth(cwd, new Set(['.ts', '.js']), new Set(['node_modules'])).some((path) =>
      readFileSync(path, 'utf8').includes('mythosExpress('));
  }
  if (framework === 'fastapi') {
    const contents = filesAtDepth(cwd, new Set(['.py']), new Set(['.venv', 'venv'])).map((path) => readFileSync(path, 'utf8'));
    return contents.some((content) => content.includes('create_mythos'))
      && contents.some((content) => content.includes('.include_router(mythos.router)'));
  }
  return false;
}

function hasNextRewrites(cwd: string): boolean {
  return ['js', 'mjs', 'ts'].some((extension) => {
    const path = join(cwd, `next.config.${extension}`);
    return existsSync(path) && readFileSync(path, 'utf8').includes('mythos-handshake');
  });
}

function isSupportedVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major > 0 || minor >= 2;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function displayUrl(value: string): string {
  const parsed = new URL(value);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export async function doctor(options: DoctorOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const processEnv = options.env ?? process.env;
  const env = loadEnv(cwd, processEnv);
  const framework = detectFramework(cwd);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  let passed = 0;
  let failed = 0;

  const secret = env.MYTHOS_SESSION_SECRET ?? '';
  if (secret) {
    write('✔ MYTHOS_SESSION_SECRET is set');
    passed += 1;
  } else {
    write('✖ MYTHOS_SESSION_SECRET is not set');
    write('Set MYTHOS_SESSION_SECRET (≥32 chars): openssl rand -base64 32');
    failed += 1;
  }

  if (framework !== 'next-app' && framework !== 'next-pages' && isOnlyInEnvFile(cwd, processEnv)) {
    write('! MYTHOS_* found only in .env — make sure your start command loads it (node --env-file=.env … / uvicorn --env-file .env)');
  }

  if (secret.length >= 32) {
    write('✔ MYTHOS_SESSION_SECRET is at least 32 chars');
    passed += 1;
  } else {
    write('✖ MYTHOS_SESSION_SECRET is too short');
    write(`MYTHOS_SESSION_SECRET is ${secret.length} chars; regenerate with openssl rand -base64 32 (and update your host's env, e.g. Vercel)`);
    failed += 1;
  }

  const listingIds = (env.MYTHOS_LISTING_IDS || env.MYTHOS_LISTING_ID || '')
    .split(',').map((id) => id.trim()).filter(Boolean);
  if (listingIds.length) {
    write(`✔ ${listingIds.length} Mythos listing ID(s) configured`);
    passed += 1;
  } else {
    write('! MYTHOS_LISTING_ID not set — fine only if your code passes resolveListingIds to createMythos()');
  }

  const apiUrl = (env.MYTHOS_API_URL === undefined ? DEFAULT_API_URL : env.MYTHOS_API_URL).replace(/\/$/, '');
  let shownApiUrl = apiUrl;
  let isValidApiUrl = false;
  try {
    const parsed = new URL(apiUrl);
    isValidApiUrl = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.host);
    if (isValidApiUrl) shownApiUrl = displayUrl(apiUrl);
  } catch {
    isValidApiUrl = false;
  }
  if (isValidApiUrl) {
    write(`✔ MYTHOS_API_URL is valid (${shownApiUrl})`);
    passed += 1;
  } else {
    write('✖ MYTHOS_API_URL is invalid');
    write('MYTHOS_API_URL must be an http(s) URL');
    failed += 1;
    write('- API reachable: skipped');
    write('- skipped');
  }

  let isApiReachable = false;
  if (isValidApiUrl) {
    try {
      const response = await fetchImpl(`${apiUrl}/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) });
      const payload = response.status === 200 ? await response.json() as { keys?: unknown } : null;
      isApiReachable = response.status === 200 && Array.isArray(payload?.keys) && payload.keys.length > 0;
      if (isApiReachable) {
        write(`✔ API reachable (${shownApiUrl})`);
        passed += 1;
      } else {
        const detail = response.status === 200 ? 'JWKS contains no keys' : String(response.status);
        write('✖ API is not reachable');
        write(`Cannot reach ${shownApiUrl} (${detail}). Check MYTHOS_API_URL / network.`);
        failed += 1;
      }
    } catch (error) {
      write('✖ API is not reachable');
      write(`Cannot reach ${shownApiUrl} (${getErrorMessage(error)}). Check MYTHOS_API_URL / network.`);
      failed += 1;
    }

    if (isApiReachable && listingIds.length) {
      for (const listingId of listingIds) {
        try {
          const response = await fetchImpl(`${apiUrl}/api/apps/${encodeURIComponent(listingId)}/run-info`, { signal: AbortSignal.timeout(5000) });
          if (response.status === 200) {
            const payload = await response.json() as { data?: { title?: unknown } };
            write(`✔ Listing ${listingId}: ${typeof payload.data?.title === 'string' ? payload.data.title : ''}`);
            passed += 1;
          } else if (response.status === 404) {
            write(`✖ Listing ${listingId} is unavailable`);
            write(`Listing ${listingId} not found or not published on ${shownApiUrl}. Check the ID and that the listing is published.`);
            failed += 1;
          } else {
            write(`✖ Listing ${listingId} check failed`);
            write(`run-info returned ${response.status}`);
            failed += 1;
          }
        } catch (error) {
          write(`✖ Listing ${listingId} check failed`);
          write(`run-info returned ${getErrorMessage(error)}`);
          failed += 1;
        }
      }
    } else {
      write('- skipped');
    }
  }

  if (isRouteWired(cwd, framework)) {
    write('✔ Mythos route is wired');
    passed += 1;
  } else {
    write('✖ Mythos route is missing');
    write('Missing Mythos route. Run: npx @mythos-work/sdk init');
    failed += 1;
  }

  if (framework === 'next-app' || framework === 'next-pages') {
    if (hasNextRewrites(cwd)) {
      write('✔ Next.js well-known rewrites are configured');
      passed += 1;
    } else {
      write('✖ Next.js well-known rewrites are missing');
      write('Add the /.well-known rewrites to next.config (see https://docs.mythos.work/getting-started/quickstart-nextjs-app)');
      failed += 1;
    }
  }

  if (framework === 'next-app' || framework === 'next-pages' || framework === 'express') {
    const installedPackage = readPackage(join(cwd, 'node_modules', '@mythos-work', 'sdk'));
    const version = installedPackage?.version;
    if (typeof version === 'string' && isSupportedVersion(version)) {
      write(`✔ @mythos-work/sdk ${version} is installed`);
      passed += 1;
    } else {
      write('✖ @mythos-work/sdk is missing or outdated');
      write('Upgrade: npm i @mythos-work/sdk@latest');
      failed += 1;
    }
  }

  write(`${passed} passed, ${failed} failed`);
  return failed ? 1 : 0;
}
