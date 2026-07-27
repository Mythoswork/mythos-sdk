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

## 2. Part A — Custom UI/Design for docs-site (Tailwind + shadcn/ui)

**Decision (per stakeholder direction): build the docs UI on Tailwind CSS + shadcn/ui, not a CSS-variable-only Infima reskin.**

### 2.1 Why this is feasible here (unlike MUI)

Docusaurus is a separate React app with its own build (webpack/Rspack, MDX, SSG) — not the same runtime as the Next.js app, so nothing is literally shared/imported across repos. That rules out pulling `frontend-main`'s MUI + Emotion layer into Docusaurus wholesale (a second CSS-in-JS runtime, heavy bundle, independent upgrade treadmill).

Tailwind + shadcn/ui don't have that problem:

- **Tailwind** is a build-time PostCSS plugin, not a runtime library — it compiles to plain CSS. Docusaurus officially supports adding Tailwind via its PostCSS plugin hook (`docusaurus.config.js` → `plugins` → a small custom plugin that extends `postcssOptions`, or the community `docusaurus-plugin-tailwindcss`).
- **shadcn/ui** isn't an npm dependency — it's copy-in source (Radix primitives + `class-variance-authority` + `clsx`/`tailwind-merge`), the same pattern already used in `frontend-main` (`src/components/ui/*`). Only the specific components docs actually needs get copied into `docs-site/src/components/ui/`, so the cost scales with what's used, not an all-or-nothing install.
- Net result: same component *pattern* as `frontend-main`'s Tailwind-based UI layer (not its MUI layer), portable with modest, boundable dependency weight (Radix + CVA + clsx, no Emotion).

### 2.2 Options considered

**Option A — Tailwind token integration.**
Wire Tailwind into the Docusaurus PostCSS pipeline, define a `tailwind.config.js` whose theme colors/radius/fonts mirror `frontend-main`'s `@theme` block in `globals.css` (primary orange `#ff9710`, dark bg/card/fg `#1a1a1a` / `#232323` / `#f7f5f1`, `12px` radius, `Inter`), and map the same values onto Infima's CSS vars in `custom.css` so built-in Docusaurus chrome (sidebar, admonitions, pagination) stays visually consistent with Tailwind-styled content. No shadcn components yet — just the token layer + utility classes available for MDX authoring.

- Effort: small–medium (PostCSS wiring + config + font/asset swap).
- Risk: low — additive build step, no component rewrites.
- Ceiling: MDX content can use Tailwind utilities, but navbar/footer/homepage still Infima-default in structure.

**Option B — Tailwind + shadcn swizzled layout.**
On top of A: copy the shadcn primitives docs actually needs (`button`, `card`, `badge`, `separator`, `dialog` as a starting set) into `docs-site/src/components/ui/`, then swizzle `Navbar`, `Footer`, and the homepage/`Layout` component to rebuild them with those primitives instead of Infima's default markup. Also unlocks using the same `Card`/`Badge` components *inside* MDX docs content (e.g. callouts, feature grids) for visual parity with the product.

- Effort: medium — swizzling is Docusaurus's supported override mechanism, but each swizzled "unsafe" component is a maintenance surface that can drift on Docusaurus version bumps.
- Risk: medium, scoped to the swizzled files only (Tailwind/shadcn part itself is low-risk since it doesn't touch Docusaurus internals).
- Ceiling: full bespoke layout, shared visual language and reusable components with `frontend-main`.

**Option C — Shared design-tokens package.**
Extract the token layer (colors, fonts, radii) from `frontend-main`'s `globals.css` `@theme` block into a small standalone package/file (e.g. `@mythos/design-tokens`) that both `frontend-main`'s Tailwind config and `docs-site`'s `tailwind.config.js` consume, instead of each maintaining its own copy of the same hex values.

- Effort: medium — one-time extraction + wiring both consumers, plus picking a distribution method (npm workspace package vs. copied file vs. git submodule).
- Risk: low once set up; ongoing risk is process drift (a token edited in one repo, forgotten in the other) unless it's a real published/workspace package.
- Ceiling: consistency mechanism, not a visual-fidelity mechanism — same ceiling as A/B.

### 2.3 Recommendation

Do **A + B together as one implementation PR, C as fast-follow.**

- Splitting A and B into separate PRs made sense under the old Infima-only plan (B was optional bespoke work with real swizzle-maintenance risk). Under Tailwind + shadcn, B's marginal cost over A is low — once Tailwind is wired up, adding a handful of copy-in shadcn primitives and swizzling Navbar/Footer to use them is the natural finish, not a speculative extra. Landing them together also avoids a half-state where Tailwind utilities exist but the actual chrome (navbar/footer) still looks stock.
- **C** stays a fast-follow, not day-one: worth doing once the token set has stabilized, so the extraction captures the real final values instead of ones still being iterated on in the first implementation PR.

### 2.4 Concrete integration points (for the follow-up implementation PR)

- `docs-site/`: add Tailwind + PostCSS wiring (Docusaurus PostCSS plugin hook or `docusaurus-plugin-tailwindcss`), `tailwind.config.js` with theme tokens mirrored from `frontend-main`'s `globals.css` `@theme` block, `components.json` if following the same shadcn CLI convention `frontend-main` uses.
- `docs-site/src/components/ui/`: copy in the specific shadcn primitives needed (start with `button`, `card`, `badge`, `separator` — expand only as MDX content or swizzled layout actually needs more, mirroring how `frontend-main/src/components/ui` only has what's used).
- Swizzle `Navbar`, `Footer`, homepage `Layout` to use the shadcn primitives; keep Infima var overrides in `custom.css` for the parts of Docusaurus (sidebar, admonitions, search) not being swizzled, so they stay visually consistent without a full rewrite.
- `docs-site/docusaurus.config.js`: `prism.theme` / `prism.darkTheme` set to a dark Prism theme matching the surface tokens; `themeConfig.navbar.logo` and `static/img/*` swapped for real Mythos SDK marks (current files are still the Docusaurus placeholder mountain/tree/logo — `static/img/docusaurus.png`, `undraw_docusaurus_*.svg` — need replacing regardless of approach).
- Decide default color mode: `frontend-main` is dark-only (`palette.mode: 'dark'`, no light theme defined at all). Docs site should probably default to dark and either hide the light/dark toggle or keep it — open question, see §2.5.
- Social card (`docusaurus-social-card.jpg`) and favicon regenerated from real branding.

### 2.5 Open questions (need answers before implementation PR)

1. Does docs stay dark-only (matching `frontend-main`, which has no light palette), or does it keep Docusaurus's light/dark toggle? Infima defaults to light — going dark-only is a deliberate deviation.
2. Is `Inter` self-hosted (static font files checked into `static/`) or loaded from Google Fonts at runtime? Self-hosting avoids an external request per page load and matches how `frontend-main` loads fonts via `next/font` (which self-hosts by default).
3. Who owns the actual logo/wordmark asset export for the docs navbar — reuse `frontend-main`'s `src/assets/logo+wordmark.png` / `logo-white.png` as source, or is there a dedicated brand-asset source?
4. Tailwind version: match `frontend-main`'s Tailwind v4 (`@theme` syntax, CSS-first config) for consistency, or v3 (`tailwind.config.js`-first) if that's simpler to wire into Docusaurus's current PostCSS setup? Affects which docs/tooling apply.
5. Initial shadcn primitive set — is `button`/`card`/`badge`/`separator` the right starting scope for Option B, or does the swizzled navbar/footer need more (e.g. `dropdown-menu`, `sheet` for mobile nav) from day one?
6. Is Option C (shared tokens package) worth a real npm workspace, or is "copy the token values, leave a comment pointing at `globals.css`" good enough given `docs-site` and `frontend-main` are separate repos/deploy targets today?

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

None of the Part A branding work changes the deployment mechanism — it's all within `docs-site/`, so it ships through the same `deploy-docs.yml` pipeline once merged to `main`. Sequencing recommendation: land Part A (Options A+B, Tailwind + shadcn) as one PR, verify it deploys correctly via the existing pipeline, *then* decide on Option C as a follow-up. Keeps the implementation PR independently reviewable and rollback-able from the deploy pipeline.

---

## 4. Rollout

1. This spec (review/approve the options in §2.3 and answer §2.5).
2. PR 1: Tailwind + shadcn integration (Options A+B) — token config, copy-in shadcn primitives, swizzled Navbar/Footer/Layout, real logo/favicon/social-card assets, Prism dark theme.
3. Confirm Pages Source setting (§3.2 step 1) if not already done, merge PR 1, verify live site.
4. PR 2 (optional, later): Option C shared tokens package, if §2.5.6 lands on "yes, worth a real package."
