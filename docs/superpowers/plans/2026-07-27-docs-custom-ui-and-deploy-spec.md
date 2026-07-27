# Docs Site: Custom UI/Branding + Deployment — Spec

**Status:** Draft, for review
**Scope:** `docs-site/` (Docusaurus), branding source `D:/frontend-main`
**Non-goals:** No code in this doc. This is the design/decision spec; implementation gets its own PR(s) once this is approved.

---

## 1. Background

`docs-site/` is a stock Docusaurus `classic` preset — default Infima green theme, default logo/social-card placeholders, default Prism code theme (`docusaurus.config.js`, `src/css/custom.css`). It's on-brand in structure but not in look.

`D:/frontend-main` is the real product (Next.js 16 + React 19 app router). Its brand is defined in two places:
- `src/theme/theme.ts` — MUI theme: dark mode, primary orange `#ff9710` (hover `#d97f0a`), background `#1a1a1a`, card `#232323`, foreground `#f7f5f1`, muted `#9e978f`, `Inter` body font, `12px` border radius.
- `src/app/globals.css` — Tailwind v4 `@theme` tokens (dozens of scoped `--color-profile-*`, `--color-surface-*` vars) plus `Space Grotesk` / `JetBrains Mono` display/mono fonts loaded via `next/font`.
- Component layer: MUI + Radix primitives wrapped as shadcn-style components (`src/components/ui/*`, `src/shared/ui/*`) — `button.tsx`, `card.tsx`, `dialog.tsx`, etc.

The docs site currently shares none of this.

---

## 2. Part A — Custom UI/Design for docs-site

### 2.1 The constraint that shapes every option

Docusaurus is a separate React app with its own build (webpack/Rspack, MDX, SSG) — it is **not** the same runtime as the Next.js app. You cannot literally import `frontend-main`'s MUI/Radix/Emotion components into Docusaurus pages: it would mean pulling MUI + Emotion + Radix + Tailwind v4 into the docs bundle just to render a navbar, which bloats build size, drags in a second CSS-in-JS runtime alongside Docusaurus's own Infima/CSS-modules system, and creates two independent upgrade treadmills for the same visual language.

What *is* portable without that cost: **design tokens** (colors, fonts, radii, spacing) and **hand-authored Docusaurus theme components** that express the same tokens using Docusaurus's own theming APIs (CSS variables + optional "swizzled" React components).

### 2.2 Options considered

**Option A — Token-only reskin.**
Map `frontend-main`'s core tokens (primary orange, dark background/card/foreground, `Inter` font, radius) onto Docusaurus's Infima CSS variables in `src/css/custom.css`, swap the logo/favicon/social-card in `static/img/`, and set the Prism code-block theme to a dark palette that matches `--color-surface-card`. No component swizzling. Site keeps Docusaurus's default navbar/sidebar/footer *layout*, just recolored and re-fonted.
- Effort: small (single CSS file + asset swap + font loading).
- Risk: low — no React changes, nothing to break on Docusaurus upgrades.
- Ceiling: navbar/footer/homepage structure still reads as "default Docusaurus," just recolored.

**Option B — Swizzled layout components.**
Everything in A, plus `npm run swizzle` (Docusaurus's supported override mechanism) for `Navbar`, `Footer`, and/or the homepage/`Layout` component, hand-rewritten to match `frontend-main`'s navbar/footer visual language (not shared code — reimplemented with the same tokens/spacing/radius conventions).
- Effort: medium — each swizzled component is a maintenance surface that can drift from upstream Docusaurus theme changes on version bumps.
- Risk: medium — swizzled "unsafe" components can break on `docusaurus` upgrades and need re-diffing.
- Ceiling: can look fully bespoke — custom navbar layout, footer columns, homepage hero, etc.

**Option C — Shared design-tokens package.**
Extract the token layer (colors, fonts, radii — not components) from `frontend-main` into a small standalone package (e.g. `@mythos/design-tokens`, plain JSON/CSS-vars, zero framework deps). `frontend-main`'s Tailwind/MUI theme and `docs-site`'s `custom.css` both consume it. Changes to brand color/font happen in one place instead of two.
- Effort: medium — one-time extraction + wiring both consumers, plus picking a distribution method (npm workspace package vs. copied file vs. git submodule).
- Risk: low once set up; the ongoing risk is process (someone edits a token in one repo and forgets to sync) unless it's a real published/workspace package.
- Ceiling: same as A/B visually — this is a *consistency* mechanism, not a visual-fidelity mechanism.

### 2.3 Recommendation

Do **A now, C next, B only if the extra bespoke layout is worth the upgrade-maintenance cost.**

- **A** is the highest ratio of visual-brand-recognition to effort/risk and unblocks "docs no longer look like a random Docusaurus tutorial site" immediately.
- **C** is worth doing as a fast follow so the token source of truth lives in one place — otherwise A's token mapping silently drifts from `frontend-main` the first time someone tweaks the orange in `theme.ts` and forgets `custom.css` exists.
- **B** is optional and should be scoped as its own decision later, once it's clear which specific layout pieces (navbar? footer? homepage hero?) actually need to diverge from Docusaurus defaults rather than just being recolored. Swizzled components are the one piece of this that can break on `docusaurus` version bumps, so it shouldn't be taken on speculatively.

### 2.4 Concrete integration points (for the follow-up implementation PR)

- `docs-site/src/css/custom.css`: replace `--ifm-color-primary*` scale with the orange ramp, set dark-mode background/surface/foreground vars to match `#1a1a1a` / `#232323` / `#f7f5f1`, set `--ifm-font-family-base` to `Inter` (self-hosted or `@font-face`, not a runtime Google Fonts fetch, for offline/CSP-friendly builds), set border-radius tokens to `12px` where Infima exposes them.
- `docs-site/docusaurus.config.js`: `prism.theme` / `prism.darkTheme` set to a dark Prism theme, tuned to the same surface colors; `themeConfig.navbar.logo` and `static/img/*` swapped for real Mythos SDK marks (current files are still the Docusaurus placeholder mountain/tree/logo — `static/img/docusaurus.png`, `undraw_docusaurus_*.svg` — those need replacing regardless of which option is chosen).
- Decide default color mode: `frontend-main` is dark-only (`palette.mode: 'dark'`, no light theme defined at all). Docs site should probably default to dark and either hide the light/dark toggle or keep it — open question, see §2.5.
- Social card (`docusaurus-social-card.jpg`) and favicon regenerated from real branding.

### 2.5 Open questions (need answers before implementation PR)

1. Does docs stay dark-only (matching `frontend-main`, which has no light palette), or does it keep Docusaurus's light/dark toggle? Infima defaults to light — going dark-only is a deliberate deviation.
2. Is `Inter` self-hosted (static font files checked into `static/`) or loaded from Google Fonts at runtime? Self-hosting avoids an external request per page load and matches how `frontend-main` loads fonts via `next/font` (which self-hosts by default).
3. Who owns the actual logo/wordmark asset export for the docs navbar — reuse `frontend-main`'s `src/assets/logo+wordmark.png` / `logo-white.png` as source, or is there a dedicated brand-asset source?
4. Is Option C (shared tokens package) worth a real npm workspace, or is "copy the token values, leave a comment pointing at `theme.ts`" good enough given `docs-site` and `frontend-main` are separate repos/deploy targets today?

---

## 3. Part B — Deployment

This part is largely already built (merged in PR 21/22) — this section documents what exists and what's left to flip on, not new design.

### 3.1 Current state

- `.github/workflows/deploy-docs.yml`: builds `docs-site/` with `npm ci && npm run build` on every push to `main` that touches `docs-site/**`, uploads `docs-site/build` as a Pages artifact, deploys via `actions/deploy-pages`. Also supports manual `workflow_dispatch`.
- `docs-site/docusaurus.config.js`: `url: https://mythoswork.github.io`, `baseUrl: /mythos-sdk/` — site is scoped to GitHub Pages project-site hosting under the `mythos-sdk` repo.
- Not yet confirmed: whether repo Settings → Pages → Source is actually switched to "GitHub Actions" (required for `deploy-pages` to have anywhere to publish to — if Source is still "Deploy from a branch" or unset, the workflow's deploy job will fail even though build succeeds).

### 3.2 Deployment plan

1. **One-time repo setting:** confirm/set Settings → Pages → Build and deployment → Source = **GitHub Actions**.
2. **Merge to `main`:** any push touching `docs-site/**` auto-builds and deploys. No separate deploy step needed post-merge.
3. **Manual trigger:** Actions tab → "Deploy docs" → Run workflow, for deploys that don't come from a `docs-site/` diff (e.g. after only changing the workflow file itself, or a manual re-deploy).
4. **Verification:** after the Actions run completes, hit `https://mythoswork.github.io/mythos-sdk/` and confirm the deployed content matches the latest merged commit (check footer/build metadata or a known recently-changed page).
5. **Custom domain (if wanted later):** would need a `docs-site/static/CNAME` file plus a DNS CNAME record, and updating `url`/`baseUrl` in `docusaurus.config.js` accordingly (baseUrl would become `/` instead of `/mythos-sdk/`). Not required for launch — flagged as a future option, not a decision needed now.

### 3.3 Interaction with Part A

None of the Part A branding work changes the deployment mechanism — it's all within `docs-site/`, so it ships through the same `deploy-docs.yml` pipeline once merged to `main`. Sequencing recommendation: land Part A (Option A reskin) as its own PR first, verify it deploys correctly via the existing pipeline, *then* decide on Option C/B as follow-ups. Keeps each PR independently reviewable and rollback-able.

---

## 4. Rollout

1. This spec (review/approve the options in §2.3 and answer §2.5).
2. PR 1: Option A token reskin + real logo/favicon/social-card assets + Prism dark theme. No swizzling.
3. Confirm Pages Source setting (§3.2 step 1) if not already done, merge PR 1, verify live site.
4. PR 2 (optional, later): Option C shared tokens package, if §2.5.4 lands on "yes, worth a real package."
5. PR 3 (optional, later, only if scoped): Option B swizzled navbar/footer, only for specific layout pieces identified as needing to diverge from Infima defaults.
