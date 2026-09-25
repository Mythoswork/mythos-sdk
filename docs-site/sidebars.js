// docs-site/sidebars.js
const sidebars = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Get started',
      customProps: { icon: 'rocket' },
      items: [
        'getting-started/introduction',
        'getting-started/install',
        'getting-started/quickstart-nextjs-app',
        'getting-started/quickstart-nextjs-pages',
        'getting-started/quickstart-express',
        'getting-started/quickstart-fastapi',
        'getting-started/browser-client',
        'getting-started/deploy-checklist',
        'getting-started/how-it-works',
        'getting-started/verify-integration',
      ],
    },
    {
      type: 'category',
      label: 'Recipes',
      customProps: { icon: 'compass' },
      items: [
        'recipes/standalone-mode',
        'recipes/llm-chat',
        'recipes/fixed-price-charge',
        'recipes/session-expiry',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      customProps: { icon: 'book' },
      items: [
        'concepts/token-types',
        'concepts/launch-sessions',
        'concepts/usage-metering',
        'concepts/dynamic-listing-ids',
      ],
    },
    {
      type: 'category',
      label: 'API reference',
      customProps: { icon: 'braces' },
      items: [
        'reference/create-mythos',
        'reference/errors',
        'reference/configuration',
        'reference/cli',
      ],
    },
    'ai-agents',
    {
      type: 'category',
      label: 'Advanced (0.0.x primitives)',
      customProps: { icon: 'box' },
      collapsed: true,
      items: [
        'guides/required-routes',
        'guides/watch-out-for',
        'guides/auth-patterns',
        'guides/idempotency',
        'guides/vercel-serverless',
        {
          type: 'category',
          label: 'Node primitives',
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
          label: 'Python primitives',
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
      ],
    },
    {
      type: 'category',
      label: 'Resources',
      customProps: { icon: 'box' },
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
