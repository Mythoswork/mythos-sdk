import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { useMythos } from '../src/react';

test('useMythos renders the loading state during SSR', () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  delete (globalThis as { window?: unknown }).window;

  function Probe() {
    return createElement('span', null, useMythos().status);
  }

  try {
    expect(renderToString(createElement(Probe))).toContain('loading');
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
  }
});
