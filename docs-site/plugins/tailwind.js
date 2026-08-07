// docs-site/plugins/tailwind.js
//
// Wires Tailwind v4 into Docusaurus's PostCSS pipeline and adds the `@/`
// path alias that the shadcn components vendored from frontend-main expect.
//
// Tailwind v4 is a PostCSS plugin, not a runtime library, so this adds a
// build step and no client-side weight. Preflight is deliberately excluded —
// see the note in src/css/tokens.css.

const path = require('path');

module.exports = function tailwindPlugin() {
  return {
    name: 'mythos-tailwind-plugin',

    configurePostCss(postcssOptions) {
      postcssOptions.plugins.push(require('@tailwindcss/postcss'));
      return postcssOptions;
    },

    configureWebpack() {
      return {
        resolve: {
          alias: {
            '@': path.resolve(__dirname, '..', 'src'),
          },
        },
      };
    },
  };
};
