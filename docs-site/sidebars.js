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
