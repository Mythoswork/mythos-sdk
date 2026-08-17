# Docs Site: Custom UI/Branding + Deployment — Spec

**Status:** Implemented — this PR now carries both the spec and the implementation.
**Scope:** `docs-site/` (Docusaurus 3.10.2), branding source `frontend-main`, visual target the MVP wireframe Figma frame.
**Non-goals:** No changes to docs content or information architecture. The 42 existing pages and the six sidebar sections are untouched.

---

## 1. Background

`docs-site/` was a stock Docusaurus `classic` preset — default Infima green, placeholder Docusaurus logos, default Prism theme. `frontend-main` is the product (Next.js 16 + React 19).

Facts about `frontend-main` that this spec previously got wrong, corrected against the source:

- **Token source is `src/styles/index.css`**, not `src/app/globals.css`. `components.json` points at it. It is Tailwind v4 (`@import "tailwindcss"`, `@theme inline`, `@custom-variant dark`).
- **A light palette does exist.** `:root` in that file is a complete light theme (`--background: oklch(1 0 0)`). Only the *MUI* theme is dark-only. An earlier draft claimed a light palette had to be authored from scratch; it did not.
- **Primary is `oklch(0.7788 0.17265 66.5653)` light / `oklch(0.76 0.19 58)` dark**, not the hex `#ff9710`. The oklch values are canonical; hex loses gamut.
- **`src/components/ui/*` contains no MUI.** All 25 components are Radix + CVA + lucide + `cn`. Portability was never in question for that layer.
- **Fonts** are Inter, Space Grotesk, JetBrains Mono and Unbounded via `next/font/google`.

---

## 2. Decisions

| Question | Decision |
|---|---|
| Platform | **Stay on Docusaurus**, swizzle deeply. Not a Next.js re-platform. |
| Tailwind version | **v4**, matching the product. |
| Auth chrome (bell, avatar) | **Dropped.** Avatar replaced by a "Sign in" button to the studio. A bell that never fires and an avatar that is not the reader are dead UI on a public static site. |
| Search | **`@easyops-cn/docusaurus-search-local`** — offline index, no crawler, no account, works on GitHub Pages. |
| Information architecture | **Unchanged.** The Figma is a visual spec only; its section names (AI Agents, Marketplace, SDKs) have no pages behind them in this repo. |
| Heading font | **Space Grotesk** (revised 2026-08-10). Matches `frontend-main`'s `font-space` utility (globals.css), the product's display face across nav/headings/buttons. Body copy stays Inter. Supersedes the earlier "Inter, matching the mock's body face" call. |
| Token sharing | **Vendored copy** with a provenance header in `src/css/tokens.css`. A shared package stays a fast-follow. |
| PR split | **One PR**, with one commit per area for bisectability. |

---

## 3. Implementation

### 3.1 Build layer

- Tailwind v4 through Docusaurus's `configurePostCss` hook (`plugins/tailwind.js`), which also registers the `@/` → `src/` alias the vendored components expect.
- TypeScript added (`tsconfig.json` extending `@docusaurus/tsconfig`). The site stays mixed JS/TS.
- **Preflight is deliberately excluded.** `@import "tailwindcss"` pulls in a reset that flattens Infima's typography across all 42 pages. Only the `theme` and `utilities` layers are imported. Verified absent from the built CSS.
- `src/css/tokens.css` vendors the product's `@theme inline` / `:root` / dark blocks verbatim, with two required deviations: the dark selector becomes `[data-theme='dark']` (Docusaurus's convention, not `.dark`), and Preflight is not imported.
- `src/css/custom.css` bridges `--ifm-*` onto those tokens so unswizzled chrome inherits the brand without being rewritten.
- Fonts self-hosted via `@fontsource`, latin subsets only. No runtime Google Fonts request.

Note: Docusaurus's PostCSS chain downlevels every `oklch()` to a hex fallback plus a `color(display-p3 …)` progressive upgrade, so browser support is broader than the source.

### 3.2 Accessibility deviation

Light-mode `--ifm-color-primary` is deliberately **darker** than the brand token. The product's orange is a dark-surface accent; as link colour on white it lands near 2.1:1 and fails WCAG AA. The light ramp keeps the hue and drops lightness until body-text contrast passes. Dark mode uses the brand value unmodified.

### 3.3 Swizzled components

Safety levels below were read from `swizzle --list --danger` against 3.10.2, not assumed.

| Component | Safety | Change |
|---|---|---|
| `CodeBlock/Layout` | Safe | Persistent header: language chip (shadcn `Badge`) + Copy, replacing hover-reveal floating buttons |
| `CodeBlock/Buttons/CopyButton` | Safe | Adds the Figma's visible "Copy" label |
| `Admonition/Layout` | Safe | Tinted surface + lucide icon, no label bar |
| `DocSidebarItem/Category` | Unsafe | Per-category lucide icon from `customProps.icon` |
| `DocItem/TOC/Desktop` | Unsafe | Adds the "On this page" eyebrow |
| `DocItem/Layout` | Unsafe | Explicit CSS grid (766 / 183 px) replacing Infima's percentage row |
| `DocItem/Content` | Unsafe | Hosts the meta row inside the markdown flex context |
| `DocItem/Paginator` | Unsafe | Prev/next rebuilt on shadcn `Card` |
| `Navbar/Content` | Unsafe | Three zones — brand, centred search, actions |

Three components are **Forbidden** to swizzle and the design routes around all of them: `DocItem/TOC` (reached via its `Desktop`/`Mobile` children), `NavbarItem/ComponentTypes`, `DocBreadcrumbs/Items`.

`DocItem/Layout/styles.module.css` had its `.docItemCol { max-width: 75% !important }` rule removed — it capped the content column at 75% of the grid width, which is why content measured 575px against a 766px column.

### 3.4 Vendored components

Only `badge` and `card` are vendored, copied verbatim from `frontend-main/src/components/ui/`. Nine others were copied during implementation and removed once the swizzles landed without needing them, along with the Radix packages only they pulled in. This mirrors how `frontend-main/src/components/ui` carries only what it uses.

### 3.5 Measured against the Figma

Figma frame is 2846px at 2x → 1423 CSS px. Measured in a headless browser at that exact width:

| Metric | Figma | Built |
|---|---|---|
| Sidebar rail | ~256px | 256px |
| Rail → content gutter | ~87px | 87px |
| Content column | ~766px | 766px |
| Content → TOC gutter | ~101px | 101px |
| TOC column | ~183px | 183px |
| TOC → right edge | ~30px | 30px |
| Navbar height | ~56px | 56px |

Those six horizontal values sum to the 1423px frame, which is the check that the
row is self-consistent rather than six independent guesses.

The two gutters were roughly half these values until 2026-08-17. The cause was
`--ifm-container-width`: Infima caps the `.container` wrapping `DocItem` at
1140px and pads it 1rem, leaving the grid 1110px where the frame spends 1167px.
The cap is now lifted for `.docs-wrapper .container` only — raising the variable
globally would stretch the navbar and footer too. All six values are tokens
(`--mythos-doc-gutter`, `--mythos-toc-gap`, `--mythos-doc-edge`, ...) with
narrower tiers below 1423px, because they were read off a PNG export rather than
Figma dev mode and carry a few px of measurement error.

TOC internals, also corrected on 2026-08-17: row pitch is 28px (Infima adds a
`li` margin on top of the link padding, which had it at 35px); the "ON THIS PAGE"
label and the entry labels share one left edge with the active dot hanging in a
12px gutter outside it (the dot had been inside the link's padding, pushing every
label right of the eyebrow); and the dot sits on an entry's first line rather
than the centre of a box that may be three lines tall.

Two content-robustness fixes fell out of that work, neither visible in the mock:
a heading containing inline code carries the code into the TOC, where Infima's
chip treatment broke tokens mid-word, and h3 entries needed a legible step down
since Infima's nested indent is 0.5rem.

Root font size is 15px so the whole rem-based Infima ramp rescales proportionally,
rather than patching individual sizes.

**Known divergence:** the mock's page has h3 sections but its TOC lists only h2s.
h3 entries are kept, stepped down in size and indent. `guides/ai-integration-prompt`
alone has eight of them and is mostly h3, so an h2-only TOC would cost real
navigation. Reverting to match the mock exactly is
`themeConfig.tableOfContents.maxHeadingLevel: 2`.

---

## 4. Deployment

Unchanged from PR #21/#22 and unaffected by this work — it is all inside `docs-site/`, shipping through the existing `deploy-docs.yml`.

**One manual step remains:** repo Settings → Pages → Build and deployment → Source must be **GitHub Actions**. If it is still "Deploy from a branch", the build succeeds and the deploy job fails.

After merge, verify at `https://mythoswork.github.io/mythos-sdk/`.

A custom domain would need `static/CNAME`, a DNS record, and `baseUrl` changed to `/`. Not required for launch.

---

## 5. Known gaps

1. **`og:image` is unset.** The Docusaurus placeholder social card was deleted rather than left pointing at non-Mythos artwork. A real card needs exporting.
2. **`STUDIO_URL` is inferred.** `https://mythos.work`, derived from the `api.mythos.work` host used throughout the docs. Unverified — one constant at the top of `docusaurus.config.js`.
3. **No desktop hamburger.** The Figma shows one left of the wordmark; Docusaurus only renders the sidebar toggle on mobile. Would need a `DocSidebar` collapse control.
4. **HTTP endpoint cards not built.** The Figma has POST/GET endpoint cards, but `reference/node/*` and `reference/python/*` document SDK functions, not REST endpoints. Nothing to put in them.
5. **Nine unsafe swizzles pin us to Docusaurus 3.10.2.** Recommend pinning `@docusaurus/*` to exact versions; `deploy-docs.yml` is the tripwire.
6. **`npm audit` reports 25 vulnerabilities** (21 moderate, 4 high) in the docs-site tree. Not assessed as part of this work; how many predate it is unknown.
