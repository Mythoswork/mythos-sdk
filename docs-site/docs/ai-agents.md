# Use with AI agents

Give an agent one canonical source instead of asking it to infer the integration from package internals.

## Documentation sources

- Full site text: [https://docs.mythos.work/llms-full.txt](https://docs.mythos.work/llms-full.txt)
- Node package: `node_modules/@mythos-work/sdk/AGENTS.md`
- Python wheel: `site-packages/mythos_sdk/AGENTS.md`
- Agent skill (npm): `node_modules/@mythos-work/sdk/skills/integrate-mythos-sdk/SKILL.md`

`llms-full.txt` follows the public sidebar order and excludes all Advanced 0.0.x primitives.

## Set up your coding agent

Run once in your project:

```bash
npx @mythos-work/sdk agents
```

It never overwrites existing files, and installs the same `integrate-mythos-sdk` skill everywhere:

| Tool | What it reads | Where it lands |
|---|---|---|
| Claude Code | Agent skill | `.claude/skills/integrate-mythos-sdk/SKILL.md` |
| Cursor | Agent skill | `.cursor/skills/integrate-mythos-sdk/SKILL.md` |
| Codex | Agent skill + `AGENTS.md` | `.agents/skills/integrate-mythos-sdk/SKILL.md`, root `AGENTS.md` |
| Devin | Agent skill + `AGENTS.md` | `.agents/skills/integrate-mythos-sdk/SKILL.md` (Devin's recommended path), root `AGENTS.md` |

The root `AGENTS.md` gets a short `<!-- mythos-sdk -->` section pointing at the full instructions in the installed package. An existing `AGENTS.md` keeps its content; the section is appended once.

## Copy-paste prompt

> Integrate Mythos using only the instructions in node_modules/@mythos-work/sdk/AGENTS.md. Run npx @mythos-work/sdk doctor until it passes.

For Python-only tooling, replace the final command with `python -m mythos_sdk doctor`.
