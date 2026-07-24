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
      logo: {
        alt: 'Mythos SDK Logo',
        src: 'img/logo.svg',
        href: '/getting-started/introduction',
      },
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
