import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';

import { detectFramework, doctor, type DoctorOptions, type Framework } from './doctor';

export interface InitOptions extends DoctorOptions {}

const NEXT_REWRITES = `Add these rewrites to next.config:
async rewrites() { return [
  { source: '/.well-known/mythos-handshake', destination: '/api/mythos/handshake' },
  { source: '/.well-known/mythos-listing-registered', destination: '/api/mythos/listing-registered' },
]; }`;

function relativeImport(fromFile: string, target: string): string {
  const path = relative(dirname(fromFile), target).split(sep).join('/');
  return path.startsWith('.') ? path : `./${path}`;
}

function writeIfAbsent(cwd: string, path: string, content: string, write: (line: string) => void): void {
  const absolutePath = join(cwd, path);
  if (existsSync(absolutePath)) {
    write(`! exists, skipped: ${path}`);
    return;
  }
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, 'utf8');
  write(`✔ created: ${path}`);
}

function scaffoldNext(cwd: string, framework: 'next-app' | 'next-pages', write: (line: string) => void): void {
  const usesSrc = existsSync(join(cwd, 'src', framework === 'next-app' ? 'app' : 'pages'));
  const root = usesSrc ? 'src' : '';
  const libraryPath = join(root, 'lib', 'mythos.ts');
  const routePath = framework === 'next-app'
    ? join(root, 'app', 'api', 'mythos', '[...mythos]', 'route.ts')
    : join(root, 'pages', 'api', 'mythos', '[...mythos].ts');
  const mythosImport = relativeImport(routePath, join(root, 'lib', 'mythos'));
  writeIfAbsent(cwd, libraryPath, "import { createMythos } from '@mythos-work/sdk';\nexport const mythos = createMythos();\n", write);
  const content = framework === 'next-app'
    ? `import { mythos } from '${mythosImport}';\nexport const { GET, POST } = mythos.handlers;\n`
    : `import { pagesHandler } from '@mythos-work/sdk/next';\nimport { mythos } from '${mythosImport}';\nexport default pagesHandler(mythos);\n`;
  writeIfAbsent(cwd, routePath, content, write);
}

function scaffold(cwd: string, framework: Exclude<Framework, null>, write: (line: string) => void): void {
  if (framework === 'next-app' || framework === 'next-pages') {
    scaffoldNext(cwd, framework, write);
    return;
  }
  if (framework === 'express') {
    if (existsSync(join(cwd, 'tsconfig.json'))) {
      writeIfAbsent(cwd, 'mythos.ts', "import { createMythos } from '@mythos-work/sdk';\nexport const mythos = createMythos();\n", write);
    } else {
      const packageJson = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { type?: unknown };
      const content = packageJson.type === 'module'
        ? "import { createMythos } from '@mythos-work/sdk';\nexport const mythos = createMythos();\n"
        : "const { createMythos } = require('@mythos-work/sdk');\nconst mythos = createMythos();\nmodule.exports = { mythos };\n";
      writeIfAbsent(cwd, 'mythos.js', content, write);
    }
    return;
  }
  writeIfAbsent(cwd, 'mythos_setup.py', 'from mythos_sdk import create_mythos\n\nmythos = create_mythos()\n', write);
}

function appendEnv(cwd: string, framework: Exclude<Framework, null>, write: (line: string) => void): void {
  const filename = framework === 'next-app' || framework === 'next-pages' ? '.env.local' : '.env';
  const path = join(cwd, filename);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const hasListingId = /^\s*MYTHOS_LISTING_ID\s*=/m.test(existing);
  const hasSecret = /^\s*MYTHOS_SESSION_SECRET\s*=/m.test(existing);
  if (hasListingId && hasSecret) return;
  const lines = ['# Mythos'];
  if (!hasListingId) lines.push('MYTHOS_LISTING_ID=');
  if (!hasSecret) lines.push(`MYTHOS_SESSION_SECRET=${randomBytes(32).toString('base64')}`);
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  writeFileSync(path, `${existing}${separator}${lines.join('\n')}\n`, 'utf8');
  write(`Added MYTHOS_* to ${filename} (fill MYTHOS_LISTING_ID from the Mythos dashboard)`);
}

function printManualStep(framework: Exclude<Framework, null>, write: (line: string) => void): void {
  if (framework === 'next-app' || framework === 'next-pages') write(NEXT_REWRITES);
  else if (framework === 'express') write("app.use(mythosExpress(mythos));  // import { mythosExpress } from '@mythos-work/sdk/express'");
  else write('app.include_router(mythos.router)  # from mythos_setup import mythos');
}

export async function init(options: InitOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const framework = detectFramework(cwd);
  if (!framework) {
    write('Could not detect a supported framework. Supported: Next.js App Router, Next.js Pages Router, Express, FastAPI.');
    return 1;
  }
  scaffold(cwd, framework, write);
  appendEnv(cwd, framework, write);
  printManualStep(framework, write);
  write('Tip: run npx @mythos-work/sdk agents to set up Claude Code / Cursor / Codex / Devin.');
  return doctor({ ...options, cwd, write });
}
