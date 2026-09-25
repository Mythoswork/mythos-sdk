import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface AgentsOptions {
  cwd?: string;
  write?: (line: string) => void;
}

const SKILL_PATH = join('skills', 'integrate-mythos-sdk', 'SKILL.md');

// Verified 2026-09-25: Codex scans .agents/skills (learn.chatgpt.com/docs/build-skills);
// Devin recommends .agents/skills and reads AGENTS.md (docs.devin.ai); Claude Code uses .claude/skills.
export const AGENT_SKILL_DIRS = ['.agents', '.claude', '.cursor'];

const MARKER = '<!-- mythos-sdk -->';
const POINTER_BLOCK = `${MARKER}
## Mythos SDK
This project integrates Mythos. Follow \`node_modules/@mythos-work/sdk/AGENTS.md\` for all Mythos work (Python: \`site-packages/mythos_sdk/AGENTS.md\`). Verify with \`npx @mythos-work/sdk doctor\`.
<!-- /mythos-sdk -->
`;

// dist/cli/agents.js (and src/cli/agents.ts under ts-jest) → package root is two levels up.
function readSkill(): string {
  return readFileSync(join(__dirname, '..', '..', SKILL_PATH), 'utf8');
}

export function agents(options: AgentsOptions = {}): number {
  const cwd = options.cwd ?? process.cwd();
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const skill = readSkill();

  for (const directory of AGENT_SKILL_DIRS) {
    const path = join(directory, SKILL_PATH);
    const absolutePath = join(cwd, path);
    if (existsSync(absolutePath)) {
      write(`! exists, skipped: ${path}`);
      continue;
    }
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, skill, 'utf8');
    write(`✔ created: ${path}`);
  }

  const agentsPath = join(cwd, 'AGENTS.md');
  const existing = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : null;
  if (existing?.includes(MARKER)) {
    write('! AGENTS.md already points to Mythos, skipped');
  } else if (existing === null) {
    writeFileSync(agentsPath, POINTER_BLOCK, 'utf8');
    write('✔ created: AGENTS.md');
  } else {
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(agentsPath, `${existing}${separator}${POINTER_BLOCK}`, 'utf8');
    write('✔ appended Mythos section to AGENTS.md');
  }

  write('Claude Code (.claude/skills), Codex + Devin (.agents/skills, AGENTS.md) and Cursor (.cursor/skills) are set up.');
  return 0;
}
