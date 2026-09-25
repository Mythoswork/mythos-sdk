# Install the SDK

Install the SDK, then let its CLI scaffold the integration files.

## Node.js / TypeScript

```bash
npm i @mythos-work/sdk
```

**Runtime:** Node.js 20 or newer.

## Python

```bash
pip install "mythos-sdk[fastapi,llm]"
```

**Runtime:** Python 3.11+.

## Scaffold

Run this from the application root:

```bash
npx @mythos-work/sdk init
```

The command detects Next.js App Router, Next.js Pages Router, Express, or FastAPI. It never overwrites files or edits `next.config.*` or `main.py`; follow the printed instructions for those manual lines.

## Next steps

- [Next.js App Router quickstart](quickstart-nextjs-app.md)
- [Express quickstart](quickstart-express.md)
- [FastAPI quickstart](quickstart-fastapi.md)
- [Configuration](../reference/configuration.md)
