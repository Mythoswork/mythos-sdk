// docs-site/docusaurus.config.js
const { themes } = require('prism-react-renderer');

// Product app origin. `api.mythos.work` is the API host referenced throughout
// the docs; the studio is assumed to live on the apex. Change in one place.
const STUDIO_URL = 'https://mythos.work';

const config = {
  title: 'Mythos SDK',
  tagline: 'Launch token verification, session enforcement, and usage metering for Mythos Producer apps',
  favicon: 'img/mythos-mark-black.png',

  url: 'https://docs.mythos.work',
  baseUrl: '/',

  organizationName: 'Mythoswork',
  projectName: 'mythos-sdk',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  plugins: [require.resolve('./plugins/tailwind.js')],

  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        // Offline index built at compile time — no crawler, no runtime
        // request, works as-is on GitHub Pages.
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 8,
        // The plugin renders the shortcut hint itself and picks ⌘ vs Ctrl from
        // the visitor's platform, so the Figma's ⌘K is correct on macOS
        // without hardcoding it for everyone.
        searchBarShortcut: true,
        searchBarShortcutHint: true,
      },
    ],
    // Mermaid diagram rendering for ```mermaid fenced blocks. Version must
    // match @docusaurus/core; see `markdown.mermaid` below to enable parsing.
    require.resolve('@docusaurus/theme-mermaid'),
  ],

  markdown: {
    mermaid: true,
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/Mythoswork/mythos-sdk/edit/main/docs-site/',
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: [
            // Self-hosted via @fontsource — no runtime Google Fonts request.
            // Latin subsets only; the docs are English-only today.
            require.resolve('@fontsource/inter/latin-400.css'),
            require.resolve('@fontsource/inter/latin-500.css'),
            require.resolve('@fontsource/inter/latin-600.css'),
            require.resolve('@fontsource/space-grotesk/latin-500.css'),
            require.resolve('@fontsource/space-grotesk/latin-600.css'),
            require.resolve('@fontsource/space-grotesk/latin-700.css'),
            require.resolve('@fontsource-variable/jetbrains-mono/wght.css'),
            require.resolve('./src/css/custom.css'),
          ],
        },
      },
    ],
  ],

  themeConfig: {
    // TODO(assets): og:image intentionally unset until a real Mythos social
    // card is exported. The Docusaurus placeholder has been deleted rather
    // than left pointing at a non-Mythos image.

    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },

    navbar: {
      title: '',
      logo: {
        alt: 'Mythos',
        src: 'img/mythos-wordmark.png',
        srcDark: 'img/mythos-wordmark-white.png',
        href: '/',
      },
      items: [
        // All nav links sit right of centre in the Figma; the left zone holds
        // only the brand lockup.
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'right',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/Mythoswork/mythos-sdk',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },

    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            // introduction.md carries `slug: /`, so it is the site root.
            { label: 'Introduction', to: '/' },
            { label: 'Quickstart (Next.js)', to: '/getting-started/quickstart-nextjs-app' },
            { label: 'Quickstart (FastAPI)', to: '/getting-started/quickstart-fastapi' },
          ],
        },
        {
          title: 'Reference',
          items: [
            { label: 'Server API', to: '/reference/create-mythos' },
            { label: 'Errors', to: '/reference/errors' },
          ],
        },
        {
          title: 'More',
          items: [
            { label: 'GitHub', href: 'https://github.com/Mythoswork/mythos-sdk' },
            { label: 'Mythos Studio', href: STUDIO_URL },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Mythos.`,
    },

    prism: {
      theme: themes.oneLight,
      darkTheme: themes.oneDark,
      additionalLanguages: ['bash', 'json', 'python', 'typescript'],
    },
  },
};

module.exports = config;
