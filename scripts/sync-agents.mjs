import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = path.join('skills', 'integrate-mythos-sdk', 'SKILL.md');
const copies = [
  { source: 'AGENTS.md', target: 'packages/node/AGENTS.md' },
  { source: 'AGENTS.md', target: 'packages/python/mythos_sdk/AGENTS.md' },
  { source: skill, target: path.join('packages/node', skill) },
  { source: skill, target: path.join('.cursor', skill) },
];
const isCheck = process.argv.includes('--check');
let hasDrift = false;

for (const { source, target } of copies) {
  const content = await readFile(path.join(root, source), 'utf8');
  const targetPath = path.join(root, target);
  if (isCheck) {
    const current = await readFile(targetPath, 'utf8').catch(() => null);
    if (current !== content) {
      console.error(`${source} copy is out of date: ${target}`);
      hasDrift = true;
    }
  } else {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
    console.log(`Synced ${target}`);
  }
}

if (hasDrift) process.exitCode = 1;
