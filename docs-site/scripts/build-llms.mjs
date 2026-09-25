import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsSiteDir = join(scriptDir, '..');
const { docsSidebar } = require(join(docsSiteDir, 'sidebars.js'));
const header = `# Mythos SDK

> Mythos lets users buy credits once and spend them across apps. The Mythos SDK (Node: @mythos-work/sdk, Python: mythos-sdk) handles launch, sessions, charging and LLM billing. Start with a quickstart; use createMythos() — never the 0.0.x primitives.`;

function flatten(items, isAdvanced = false) {
  return items.flatMap((item) => {
    if (typeof item === 'string') return isAdvanced ? [] : [item];
    const advanced = isAdvanced || item.label === 'Advanced (0.0.x primitives)';
    return item.items ? flatten(item.items, advanced) : [];
  });
}

function readDoc(id) {
  const markdownPath = join(docsSiteDir, 'docs', `${id}.md`);
  const mdxPath = join(docsSiteDir, 'docs', `${id}.mdx`);
  const path = existsSync(markdownPath) ? markdownPath : mdxPath;
  const source = readFileSync(path, 'utf8');
  const frontMatter = source.match(/^---\n([\s\S]*?)\n---\n?/);
  const titleFromFrontMatter = frontMatter?.[1].match(/^title:\s*(.+)$/m)?.[1].trim();
  const slug = frontMatter?.[1].match(/^slug:\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
  const body = source
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/^:::[^\n]*\n?|^:::\s*$/gm, '')
    .trim();
  const title = titleFromFrontMatter ?? body.match(/^#\s+(.+)$/m)?.[1].trim() ?? id;
  const description = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\n/g, ' ').trim())
    .find((paragraph) => paragraph && !/^(#|```|\||[-*] |\d+\. )/.test(paragraph)) ?? '';
  const url = slug === '/' ? 'https://docs.mythos.work/' : `https://docs.mythos.work/${slug ?? id}`;
  return { id, title, body, description: description.slice(0, 160), url };
}

const docs = flatten(docsSidebar).map(readDoc);
const index = `${header}\n\n## Docs\n${docs
  .map(({ title, description, url }) => `- [${title}](${url}): ${description}`)
  .join('\n')}\n\n## Full text\n- [llms-full.txt](https://docs.mythos.work/llms-full.txt)\n`;
let full = header;

for (const { title, body, url } of docs) {
  full += `\n\n---\n# ${title}\nSource: ${url}\n\n${body}`;
}

const agentsPath = join(docsSiteDir, '..', 'AGENTS.md');
if (existsSync(agentsPath)) {
  full += `\n\n---\n# AGENTS.md\n\n${readFileSync(agentsPath, 'utf8').trim()}`;
}

writeFileSync(join(docsSiteDir, 'build', 'llms.txt'), index);
writeFileSync(join(docsSiteDir, 'build', 'llms-full.txt'), `${full}\n`);
