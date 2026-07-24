# Docusaurus Documentation Publish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Honkit/GitBook-style docs build (`docs/book.json`, `docs/SUMMARY.md`) with a Docusaurus site containing the same content, and publish it free via GitHub Pages.

**Architecture:** New Docusaurus project at `docs-site/`. All existing markdown under `docs/{getting-started,concepts,guides,reference,resources}` is copied into `docs-site/docs/` with the same relative paths, gitbook `{% hint %}` blocks converted to Docusaurus admonitions, and navigation rebuilt in `sidebars.js` mirroring the section order already in `docs/SUMMARY.md`. A GitHub Actions workflow builds and deploys `docs-site/` to the `gh-pages` branch on every push to `main` that touches `docs-site/**`.

**Current state (as of `main` @ `de46fe2`, PR #20):** The Honkit *build tooling* is already gone — `docs/package.json`, `docs/package-lock.json`, and `docs/_honkit-plugin-hints/` were removed in #20. What's left behind is only `docs/book.json` (now a dead config file with nothing to run it) and `docs/SUMMARY.md` (nav file, harmless to keep as reference until Task 7). The gitbook `{% hint style="info|warning" %}` syntax was **not** touched by #20 and is still present in the doc content (33 occurrences at time of writing — re-count at execution time, don't trust this number). Net effect: docs are currently unpublished/unbuilt raw markdown with leftover gitbook syntax. This plan does not need to "retire a working Honkit site" — it needs to migrate raw content and clean up two stray files.

**Tech Stack:** Docusaurus 3 (classic preset), Node.js 18+, GitHub Actions, GitHub Pages.

## Global Constraints

- Free hosting only — GitHub Pages (repo is `Mythoswork/mythos-sdk`), no paid GitBook/Vercel Pro/etc.
- Preserve all existing page content; this is a migration, not a rewrite. Do not edit doc prose beyond syntax conversion (gitbook hints → admonitions) and link-path fixes needed to build.
- All 34 `{% hint style="info" %}` / `{% hint style="warning" %}` occurrences (see Task 3) must be converted — zero leftover gitbook syntax in `docs-site/docs/**`.
- Section order and grouping in `sidebars.js` must match `docs/SUMMARY.md` exactly: Get started, Concepts, Guides, API reference — Node.js, API reference — Python, Resources.
- `docs/examples/**` and `docs/superpowers/**` are internal (code samples consumed by tests, and planning docs) — they are not part of the published site and must not be copied into `docs-site/`.
- Do not modify `packages/node` or `packages/python` source — this is a docs-only change.
- Docusaurus build must pass with `onBrokenLinks: 'throw'` — no silently broken internal links.
- Honkit removal (Task 7) only happens after Task 6's deploy is verified live — never delete the working docs before the replacement is confirmed.

---

## File Structure

- Create: `docs-site/package.json`, `docs-site/docusaurus.config.js`, `docs-site/sidebars.js` — Docusaurus project root
- Create: `docs-site/docs/**` — migrated content, same relative paths as `docs/{getting-started,concepts,guides,reference,resources}/**`
- Create: `docs-site/static/img/` — placeholder for any images (none currently referenced; verified in Task 1)
- Create: `.github/workflows/deploy-docs.yml` — build + deploy to `gh-pages` on push to `main`
- Modify: `README.md` (repo root) — swap any docs link to the new GitHub Pages URL once live (Task 6)
- Delete (Task 7 only): `docs/book.json`, `docs/_honkit-plugin-hints/`, `docs/_book/`, `docs/SUMMARY.md`, `docs/package.json`, `docs/package-lock.json`, `docs/node_modules/`, and the now-redundant `docs/{getting-started,concepts,guides,reference,resources}/**` originals

---

### Task 1: Scaffold the Docusaurus project

**Files:**
- Create: `docs-site/` (via `create-docusaurus` scaffold — classic template, TypeScript disabled to keep parity with plain-markdown content)

**Interfaces:**
- Produces: a working `docs-site/` Docusaurus project with default `npm run build` / `npm run start` scripts that later tasks add content into.

- [ ] **Step 1: Scaffold**

```bash
npx create-docusaurus@latest docs-site classic
```

- [ ] **Step 2: Strip the template's placeholder content**

```bash
rm -rf docs-site/blog
rm -rf docs-site/docs/*
rm -f docs-site/src/pages/index.tsx docs-site/src/pages/markdown-page.md
```

Keep `docs-site/src/css/custom.css` and `docs-site/static/img/` (favicon etc.) — no reason to touch theme assets yet.

- [ ] **Step 3: Verify the stripped scaffold still builds**

Run: `cd docs-site && npm run build`
Expected: build fails or warns about missing `docs/intro.md` / empty docs dir (template's default `sidebars.js` points at deleted files) — this is expected at this stage since content isn't migrated yet. Confirm the failure is *only* about missing docs content, not a broken install (no npm/dependency errors in the output).

- [ ] **Step 4: Commit**

```bash
git add docs-site/package.json docs-site/package-lock.json docs-site/docusaurus.config.js docs-site/sidebars.js docs-site/src docs-site/static docs-site/.gitignore
git commit -m "docs: scaffold Docusaurus project"
```

---

### Task 2: Configure site metadata and sidebar structure

**Files:**
- Modify: `docs-site/docusaurus.config.js`
- Modify: `docs-site/sidebars.js`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the scaffold existing.
- Produces: `sidebars.js` category IDs that Task 3's migrated files must land under (`docs/getting-started/*`, `docs/concepts/*`, `docs/guides/*`, `docs/reference/node/*`, `docs/reference/python/*`, `docs/resources/*`) — later tasks depend on these exact directory names matching.

- [ ] **Step 1: Set site metadata in `docusaurus.config.js`**

```js
// docs-site/docusaurus.config.js
const config = {
  title: 'Mythos SDK',
  tagline: 'Launch token verification, session enforcement, and usage metering for Mythos Producer apps',
  favicon: 'img/favicon.ico',

  url: 'https://mythoswork.github.io',
  baseUrl: '/mythos-sdk/',

  organizationName: 'Mythoswork',
  projectName: 'mythos-sdk',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/Mythoswork/mythos-sdk/edit/main/docs-site/',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Mythos SDK',
      items: [
        {
          href: 'https://github.com/Mythoswork/mythos-sdk',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
  },
};

module.exports = config;
```

- [ ] **Step 2: Write `sidebars.js` mirroring `docs/SUMMARY.md`**

```js
// docs-site/sidebars.js
const sidebars = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Get started',
      items: [
        'getting-started/introduction',
        'getting-started/how-it-works',
        'getting-started/install',
        'getting-started/quickstart-node',
        'getting-started/quickstart-python',
        'getting-started/verify-integration',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/token-types',
        'concepts/launch-sessions',
        'concepts/usage-metering',
        'concepts/dynamic-listing-ids',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/ai-integration-prompt',
        'guides/required-routes',
        'guides/watch-out-for',
        'guides/frontend-client',
        'guides/auth-patterns',
        'guides/idempotency',
        'guides/express',
        'guides/fastapi',
        'guides/nextjs',
        'guides/vercel-serverless',
      ],
    },
    {
      type: 'category',
      label: 'API reference — Node.js',
      items: [
        'reference/node/overview',
        'reference/node/handshake-route',
        'reference/node/listing-callback-route',
        'reference/node/require-launch-token',
        'reference/node/verify-launch-token',
        'reference/node/report-usage',
        'reference/node/errors',
        'reference/node/configuration',
      ],
    },
    {
      type: 'category',
      label: 'API reference — Python',
      items: [
        'reference/python/overview',
        'reference/python/handshake-router',
        'reference/python/create-listing-callback-handler',
        'reference/python/require-launch-token',
        'reference/python/verify-launch-token',
        'reference/python/report-usage',
        'reference/python/errors',
        'reference/python/configuration',
      ],
    },
    {
      type: 'category',
      label: 'Resources',
      items: [
        'resources/code-examples',
        'resources/mock-integration-apps',
        'resources/troubleshooting',
        'resources/security',
        'resources/glossary',
      ],
    },
  ],
};

module.exports = sidebars;
```

- [ ] **Step 3: Commit**

```bash
git add docs-site/docusaurus.config.js docs-site/sidebars.js
git commit -m "docs: configure Docusaurus site metadata and sidebar structure"
```

(Build is expected to still fail here — the doc files the sidebar references don't exist until Task 3.)

---

### Task 3: Migrate content and convert gitbook syntax

**Files:**
- Create: `docs-site/docs/getting-started/*.md` (6 files), `docs-site/docs/concepts/*.md` (4), `docs-site/docs/guides/*.md` (10), `docs-site/docs/reference/node/*.md` (8), `docs-site/docs/reference/python/*.md` (8), `docs-site/docs/resources/*.md` (5)
- Read: `docs/getting-started/**`, `docs/concepts/**`, `docs/guides/**`, `docs/reference/**`, `docs/resources/**` (sources)

**Interfaces:**
- Consumes: `sidebars.js` item IDs from Task 2 (each ID must resolve to an existing file at that path).
- Produces: content Task 4 builds and Task 5 link-checks.

- [ ] **Step 1: Copy the five content directories as-is**

```bash
mkdir -p docs-site/docs/getting-started docs-site/docs/concepts docs-site/docs/guides docs-site/docs/reference/node docs-site/docs/reference/python docs-site/docs/resources
cp docs/getting-started/*.md docs-site/docs/getting-started/
cp docs/concepts/*.md docs-site/docs/concepts/
cp docs/guides/*.md docs-site/docs/guides/
cp docs/reference/node/*.md docs-site/docs/reference/node/
cp docs/reference/python/*.md docs-site/docs/reference/python/
cp docs/resources/*.md docs-site/docs/resources/
```

- [ ] **Step 2: Convert gitbook hints to Docusaurus admonitions**

Only two styles exist in this repo (`info`, `warning`), both single-line-delimited `{% hint style="X" %} ... {% endhint %}` blocks — confirmed via `grep -rn '{% hint style=' docs/*/**.md` (33 occurrences as of `main` @ `de46fe2`; re-count at execution time since this drifts). Convert each with:

```bash
cd docs-site/docs
grep -rl '{% hint style="info" %}' . | xargs sed -i 's/{% hint style="info" %}/:::info/; s/{% endhint %}/:::/'
grep -rl '{% hint style="warning" %}' . | xargs sed -i 's/{% hint style="warning" %}/:::warning/; s/{% endhint %}/:::/'
```

Run the info substitution first, then the warning one, so files with both styles get both replaced correctly (each `sed` invocation only touches lines matching its own opening tag; `{% endhint %}` is generic and closes whichever admonition is currently open, which works because these blocks are never nested in the source).

- [ ] **Step 3: Verify no gitbook syntax remains**

Run: `grep -rn '{% ' docs-site/docs/`
Expected: no output (empty). If any `{% content-ref %}` or `{% tabs %}` blocks turn up (not seen in the current grep of `docs/`, but re-check since Step 2 only targets `hint`), convert them by hand: `{% content-ref url="x.md" %}...{% endcontent-ref %}` → a plain markdown link.

- [ ] **Step 4: Verify the build succeeds**

Run: `cd docs-site && npm run build`
Expected: `[SUCCESS] Generated static files in "build".` — no broken-link errors (would throw per `onBrokenLinks: 'throw'` from Task 2).

- [ ] **Step 5: Commit**

```bash
git add docs-site/docs
git commit -m "docs: migrate content from Honkit to Docusaurus, convert hint blocks to admonitions"
```

---

### Task 4: Fix cross-page relative links broken by the move

**Files:**
- Modify: any file under `docs-site/docs/**` whose relative links don't resolve (exact list only known after running the checker below — the source tree's links were written for Honkit's flat per-folder resolution, which Docusaurus mostly matches 1:1 since directory structure is preserved, but verify).

**Interfaces:**
- Consumes: build output from Task 3 Step 4.

- [ ] **Step 1: Run the build with link checking and capture failures**

Run: `cd docs-site && npm run build 2>&1 | tee /tmp/docusaurus-build.log`
Expected: if Task 3 already passed cleanly, this reconfirms it — treat any `Error: Broken link` lines as this task's worklist.

- [ ] **Step 2: For each broken link reported, fix the relative path**

Docusaurus resolves `.md` links relative to the *current file's directory*, same as Honkit — most links should already work unmodified. Common fix pattern if one doesn't:

```diff
-[dynamic listing IDs](../concepts/dynamic-listing-ids.md)
+[dynamic listing IDs](/concepts/dynamic-listing-ids)
```

(Docusaurus strips `.md` extensions in generated routes; relative `.md` links still resolve at build time via the MDX loader, so only change a link if the build actually flags it — don't preemptively rewrite working links.)

- [ ] **Step 3: Re-run build until clean**

Run: `cd docs-site && npm run build`
Expected: `[SUCCESS] Generated static files in "build".`, zero broken-link errors.

- [ ] **Step 4: Commit** (skip if Step 1 found nothing to fix)

```bash
git add docs-site/docs
git commit -m "docs: fix relative links broken by Docusaurus migration"
```

---

### Task 5: Local review pass

**Files:** none (verification-only task)

- [ ] **Step 1: Serve locally and spot-check navigation**

Run: `cd docs-site && npm run serve`
Expected: site serves on `http://localhost:3000/mythos-sdk/`. Open it; confirm sidebar shows all six categories in `docs/SUMMARY.md` order, and that a page from each category (e.g. `getting-started/install`, `reference/python/errors`) renders with admonitions styled as callout boxes, not raw `:::info` text.

- [ ] **Step 2: Confirm every page from `SUMMARY.md` is reachable**

Run: `grep -c '\.md)' docs/SUMMARY.md` (expect 40 — total page count) and manually click through the sidebar counting rendered pages, or run a link-count script:

```bash
find docs-site/docs -name '*.md' | wc -l
```

Expected: `40` (6 + 4 + 10 + 8 + 8 + 5 — wc counts files whether or not sidebars.js unintentionally omits one; cross-check against sidebars.js item counts by section if this doesn't match).

---

### Task 6: Deploy to GitHub Pages via GitHub Actions

**Files:**
- Create: `.github/workflows/deploy-docs.yml`

**Interfaces:**
- Consumes: `docs-site/` project from Tasks 1–5 (must build cleanly via `npm run build`).
- Produces: a live site at `https://mythoswork.github.io/mythos-sdk/` — Task 7 depends on this being confirmed live before deleting Honkit.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/deploy-docs.yml
name: Deploy docs

on:
  push:
    branches: [main]
    paths:
      - 'docs-site/**'
      - '.github/workflows/deploy-docs.yml'
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: docs-site/package-lock.json
      - run: npm ci
        working-directory: docs-site
      - run: npm run build
        working-directory: docs-site
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs-site/build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-docs.yml
git commit -m "ci: deploy docs-site to GitHub Pages on push to main"
```

- [ ] **Step 3: After merge — enable Pages and verify**

One-time repo setting (not part of this PR, do after merge): in GitHub repo Settings → Pages, set Source to "GitHub Actions". Then push to `main` (the merge itself triggers it) and confirm the `Deploy docs` workflow run succeeds in the Actions tab, and `https://mythoswork.github.io/mythos-sdk/` serves the site.

---

### Task 7: Remove superseded content and the two stray Honkit files (only after Task 6 is confirmed live)

The Honkit *build tooling* (`docs/package.json`, `docs/package-lock.json`, `docs/_honkit-plugin-hints/`) is already gone as of `main` @ `de46fe2` (PR #20) — nothing to do there. What's left to clean up is the now-dead `docs/book.json` (references a plugin whose package no longer exists in this repo), `docs/SUMMARY.md` (superseded by `sidebars.js`), and the five original content directories now duplicated under `docs-site/docs/`.

**Files:**
- Delete: `docs/book.json`, `docs/SUMMARY.md`
- Delete: `docs/getting-started/`, `docs/concepts/`, `docs/guides/`, `docs/reference/`, `docs/resources/` (superseded by `docs-site/docs/**`)
- Keep: `docs/examples/`, `docs/superpowers/`, `docs/INTEGRATION.md`, `docs/PRODUCER_INTEGRATION.md`, `docs/PRODUCER_MASTER_PROMPT.md`, `docs/README.md` — unrelated to this migration

**Interfaces:**
- Consumes: confirmed-live deploy from Task 6 Step 3 — do not start this task until that's verified, per Global Constraints.

- [ ] **Step 1: Re-verify current state before deleting anything**

Run: `git ls-files docs/package.json docs/package-lock.json docs/_honkit-plugin-hints`
Expected: no output — if any of these are still tracked, PR #20 was reverted or this plan is being executed against a different base; stop and re-derive this task's file list from what's actually present instead of trusting the note above.

- [ ] **Step 2: Remove the stray config and superseded content**

```bash
git rm docs/book.json docs/SUMMARY.md
git rm -r docs/getting-started docs/concepts docs/guides docs/reference docs/resources
```

- [ ] **Step 3: Confirm nothing else in the repo references the removed paths**

Run: `grep -rn "docs/getting-started\|docs/concepts\|docs/guides\|docs/reference\|docs/resources\|honkit\|book.json" --include='*.md' --include='*.json' --include='*.yml' -- . ':!docs-site' ':!docs/superpowers'`
Expected: no remaining references outside `docs-site/` and the historical plan files in `docs/superpowers/plans/`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: remove superseded Honkit-era content now that Docusaurus site is live"
```

---

### Task 8: Point the repo at the new docs site

**Files:**
- Modify: `README.md` (repo root) — replace any GitBook/Honkit doc link with `https://mythoswork.github.io/mythos-sdk/`

- [ ] **Step 1: Update the link**

Grep `README.md` for the current docs link and replace it with the GitHub Pages URL.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: point README at the published Docusaurus site"
```
