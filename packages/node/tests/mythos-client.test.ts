import {
  initMythos,
  resetMythosClientForTests,
  type MythosClient,
} from '../src/mythos-client';

type MessageListener = (event: { data: unknown; source: unknown; origin: string }) => void;

interface FakeWindowOptions {
  embedded?: boolean;
  search?: string;
  storage?: Record<string, string>;
  storageThrows?: boolean;
  postMessageThrows?: boolean;
}

const SESSION = {
  userId: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  listingId: 'listing-1',
  sessionJti: 'session-1',
};

const sessionBody = (sessionToken = 'token-1') => ({
  success: true,
  data: { session: SESSION, sessionToken },
});

const response = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function installFakeWindow(options: FakeWindowOptions = {}) {
  const values = new Map(Object.entries(options.storage ?? {}));
  const listeners: MessageListener[] = [];
  const parentCalls: Array<{ data: unknown; origin: string }> = [];
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  const win = {
    parent: undefined as unknown,
    location: { search: options.search ?? '', href: 'https://app.test/calculator', origin: 'https://app.test' },
    crypto: { randomUUID: () => 'request-1' },
    fetch: fetchMock,
    sessionStorage: {
      getItem: (key: string) => {
        if (options.storageThrows) throw new Error('storage unavailable');
        return values.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (options.storageThrows) throw new Error('storage unavailable');
        values.set(key, value);
      },
      removeItem: (key: string) => {
        if (options.storageThrows) throw new Error('storage unavailable');
        values.delete(key);
      },
    },
    addEventListener: (_type: string, listener: MessageListener) => listeners.push(listener),
    removeEventListener: (_type: string, listener: MessageListener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
    setTimeout: (callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  };
  const parent = options.embedded === false
    ? win
    : {
        postMessage: (data: unknown, origin: string) => {
          if (options.postMessageThrows) throw new DOMException('Invalid target origin');
          parentCalls.push({ data, origin });
        },
      };
  win.parent = parent;

  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = win;

  return {
    fetchMock,
    parentCalls,
    storage: values,
    dispatchMessage: (data: unknown, origin = '*') =>
      listeners.forEach((listener) => listener({ data, source: parent, origin })),
    restore: () => {
      (globalThis as { window?: unknown }).window = previousWindow;
    },
  };
}

function initialiseWithExistingCookie(fake: ReturnType<typeof installFakeWindow>): MythosClient {
  fake.storage.set('mythos:transport', 'cookie');
  fake.fetchMock.mockResolvedValueOnce(response(sessionBody()));
  return initMythos();
}

beforeEach(() => {
  resetMythosClientForTests();
});

test('standalone clears transport storage and does not send a handshake', async () => {
  const fake = installFakeWindow({
    embedded: false,
    storage: { 'mythos:transport': 'header', 'mythos:session-token': 'old-token' },
  });
  fake.fetchMock.mockResolvedValueOnce(response({ success: true, data: null }));
  try {
    const state = await initMythos().ready;
    expect(state.status).toBe('standalone');
    expect(fake.storage.size).toBe(0);
    expect(fake.parentCalls).toEqual([]);
  } finally {
    fake.restore();
  }
});

test('first session uses cookie mode when the one-time probe finds the same session', async () => {
  const fake = installFakeWindow({ search: '?lt=abc' });
  fake.fetchMock
    .mockResolvedValueOnce(response(sessionBody()))
    .mockResolvedValueOnce(response(sessionBody()));
  try {
    const state = await initMythos().ready;
    expect(state).toMatchObject({ status: 'mythos', session: SESSION });
    expect(fake.fetchMock.mock.calls[0][0]).toBe('/api/mythos/session?lt=abc');
    expect(fake.fetchMock.mock.calls[1][0]).toBe('/api/mythos/session');
    expect(new Headers(fake.fetchMock.mock.calls[1][1]?.headers).has('X-Mythos-Session')).toBe(false);
    expect(fake.storage.get('mythos:transport')).toBe('cookie');
    expect(fake.storage.has('mythos:session-token')).toBe(false);
    expect(fake.parentCalls).toEqual([{ data: { type: 'mythos:handshake' }, origin: '*' }]);
  } finally {
    fake.restore();
  }
});

test('header mode stores the token and adds it to authenticated fetches', async () => {
  const fake = installFakeWindow({ search: '?lt=abc' });
  fake.fetchMock
    .mockResolvedValueOnce(response(sessionBody('header-token')))
    .mockResolvedValueOnce(response({ success: true, data: null }))
    .mockResolvedValueOnce(response({ success: true, data: {} }));
  try {
    const client = initMythos();
    await client.ready;
    await client.fetch('/api/calculate', { method: 'POST' });
    const request = fake.fetchMock.mock.calls[2];
    expect(fake.storage.get('mythos:transport')).toBe('header');
    expect(fake.storage.get('mythos:session-token')).toBe('header-token');
    expect(new Headers(request[1]?.headers).get('X-Mythos-Session')).toBe('header-token');
    expect(request[1]?.credentials).toBe('same-origin');
  } finally {
    fake.restore();
  }
});

test('header mode does not send the session token to a cross-origin URL', async () => {
  const fake = installFakeWindow({
    storage: { 'mythos:transport': 'header', 'mythos:session-token': 'secret-token' },
  });
  fake.fetchMock
    .mockResolvedValueOnce(response(sessionBody('secret-token')))
    .mockResolvedValueOnce(response({ success: true }));
  try {
    const client = initMythos();
    await client.ready;
    await client.fetch('https://example.test/resource');
    const headers = new Headers(fake.fetchMock.mock.calls[1][1]?.headers);
    expect(headers.has('X-Mythos-Session')).toBe(false);
  } finally {
    fake.restore();
  }
});

test('authenticated fetch preserves headers from a Request input', async () => {
  const fake = installFakeWindow({
    storage: { 'mythos:transport': 'header', 'mythos:session-token': 'secret-token' },
  });
  fake.fetchMock
    .mockResolvedValueOnce(response(sessionBody('secret-token')))
    .mockResolvedValueOnce(response({ success: true }));
  try {
    const client = initMythos();
    await client.ready;
    await client.fetch(new Request('https://app.test/api/calculate', {
      credentials: 'include',
      headers: { 'X-Custom-Header': 'preserved' },
    }));
    const headers = new Headers(fake.fetchMock.mock.calls[1][1]?.headers);
    expect(headers.get('X-Custom-Header')).toBe('preserved');
    expect(headers.get('X-Mythos-Session')).toBe('secret-token');
    expect(fake.fetchMock.mock.calls[1][1]?.credentials).toBe('include');
  } finally {
    fake.restore();
  }
});

test.each([undefined, ''])('header mode rejects a session response with token %p', async (token) => {
  const fake = installFakeWindow();
  fake.fetchMock
    .mockResolvedValueOnce(response({
      success: true,
      data: { session: SESSION, ...(token === undefined ? {} : { sessionToken: token }) },
    }))
    .mockResolvedValueOnce(response({ success: true, data: null }));
  try {
    expect(await initMythos().ready).toMatchObject({
      status: 'error',
      error: { code: 'INVALID_SESSION_RESPONSE' },
    });
    expect(fake.storage.has('mythos:transport')).toBe(false);
  } finally {
    fake.restore();
  }
});

test('a remembered cookie transport skips the probe', async () => {
  const fake = installFakeWindow({ storage: { 'mythos:transport': 'cookie' } });
  fake.fetchMock.mockResolvedValueOnce(response(sessionBody()));
  try {
    await initMythos().ready;
    expect(fake.fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    fake.restore();
  }
});

test('remembered header mode includes the token in the first session request', async () => {
  const fake = installFakeWindow({
    storage: { 'mythos:transport': 'header', 'mythos:session-token': 'stored-token' },
  });
  fake.fetchMock.mockResolvedValueOnce(response(sessionBody('stored-token')));
  try {
    await initMythos().ready;
    const headers = new Headers(fake.fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('X-Mythos-Session')).toBe('stored-token');
  } finally {
    fake.restore();
  }
});

test('an embedded tab with remembered transport treats a missing session as expired', async () => {
  const fake = installFakeWindow({ storage: { 'mythos:transport': 'cookie' } });
  fake.fetchMock.mockResolvedValueOnce(response({ success: true, data: null }));
  try {
    expect(await initMythos().ready).toMatchObject({
      status: 'expired',
      error: { code: 'SESSION_EXPIRED' },
    });
  } finally {
    fake.restore();
  }
});

test.each([
  [401, { success: false, code: 'SESSION_EXPIRED', error: 'Expired' }, 'expired', 'SESSION_EXPIRED'],
  [502, { success: false, code: 'UPSTREAM_ERROR', error: 'Unavailable' }, 'error', 'UPSTREAM_ERROR'],
] as const)('session endpoint status %s maps to %s', async (status, body, expectedStatus, expectedCode) => {
  const fake = installFakeWindow();
  fake.fetchMock.mockResolvedValueOnce(response(body, status));
  try {
    expect(await initMythos().ready).toMatchObject({
      status: expectedStatus,
      error: { code: expectedCode },
    });
  } finally {
    fake.restore();
  }
});

test('a session network failure becomes a non-rejecting NETWORK_ERROR state', async () => {
  const fake = installFakeWindow();
  fake.fetchMock.mockRejectedValueOnce(new Error('offline'));
  try {
    expect(await initMythos().ready).toMatchObject({
      status: 'error',
      error: { code: 'NETWORK_ERROR', message: 'Error: offline' },
    });
  } finally {
    fake.restore();
  }
});

test('authenticated fetch marks a SESSION_ 401 expired without consuming its response', async () => {
  const fake = installFakeWindow();
  const client = initialiseWithExistingCookie(fake);
  fake.fetchMock.mockResolvedValueOnce(
    response({ success: false, code: 'SESSION_REQUIRED', error: 'Session required' }, 401),
  );
  const listener = jest.fn();
  try {
    await client.ready;
    client.subscribe(listener);
    const result = await client.fetch('/api/calculate');
    expect(client.state).toMatchObject({ status: 'expired', error: { code: 'SESSION_REQUIRED' } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await result.json()).toMatchObject({ code: 'SESSION_REQUIRED' });
  } finally {
    fake.restore();
  }
});

test.each([
  response({ success: false, code: 'INVALID_USAGE', error: 'Bad usage' }, 401),
  new Response('not-json', { status: 401 }),
])('authenticated fetch ignores non-session 401 responses', async (unauthorisedResponse) => {
  const fake = installFakeWindow();
  const client = initialiseWithExistingCookie(fake);
  fake.fetchMock.mockResolvedValueOnce(unauthorisedResponse);
  try {
    await client.ready;
    await client.fetch('/api/calculate');
    expect(client.state.status).toBe('mythos');
  } finally {
    fake.restore();
  }
});

test('client charge confirmation returns approval and consent ID', async () => {
  const fake = installFakeWindow();
  const client = initialiseWithExistingCookie(fake);
  try {
    await client.ready;
    const pending = client.confirmCharge({ credits: 2, reason: 'calculate' });
    fake.dispatchMessage({
      type: 'mythos:confirm-charge-response',
      requestId: 'request-1',
      approved: true,
      consentId: 'consent-1',
    });
    expect(await pending).toEqual({ approved: true, consentId: 'consent-1' });
  } finally {
    fake.restore();
  }
});

test('LLM charge confirmation needs no credits and sends a numeric placeholder', async () => {
  const fake = installFakeWindow();
  const client = initialiseWithExistingCookie(fake);
  try {
    await client.ready;
    const pending = client.confirmCharge({ kind: 'llm', reason: 'chat' });
    const request = fake.parentCalls
      .map((call) => call.data as { type?: string; credits?: unknown; kind?: string; requestId?: string })
      .find((data) => data.type === 'mythos:confirm-charge');
    expect(request).toMatchObject({ credits: 0, kind: 'llm', reason: 'chat' });
    fake.dispatchMessage({ type: 'mythos:confirm-charge-response', requestId: request?.requestId, approved: true });
    expect(await pending).toEqual({ approved: true });
    // @ts-expect-error LLM confirmations are usage-based and must not take credits
    void client.confirmCharge({ kind: 'llm', credits: 1 });
  } finally {
    fake.restore();
  }
});

test('client charge confirmation fails closed on timeout', async () => {
  const fake = installFakeWindow();
  fake.storage.set('mythos:transport', 'cookie');
  fake.fetchMock.mockResolvedValueOnce(response(sessionBody()));
  try {
    const client = initMythos({ confirmTimeoutMs: 1 });
    await client.ready;
    await expect(client.confirmCharge({ credits: 2 })).resolves.toEqual({ approved: false });
  } finally {
    fake.restore();
  }
});

test('messaging failures do not reject session readiness or charge confirmation', async () => {
  const fake = installFakeWindow({
    postMessageThrows: true,
    storage: { 'mythos:transport': 'cookie' },
  });
  fake.fetchMock.mockResolvedValueOnce(response(sessionBody()));
  try {
    const client = initMythos({ expectedOrigin: 'invalid-origin' });
    await expect(client.ready).resolves.toMatchObject({ status: 'mythos' });
    await expect(client.confirmCharge({ credits: 1 })).resolves.toEqual({ approved: false });
  } finally {
    fake.restore();
  }
});

test('relaunch posts only when embedded and respects expectedOrigin', async () => {
  const embedded = installFakeWindow();
  embedded.storage.set('mythos:transport', 'cookie');
  embedded.fetchMock.mockResolvedValueOnce(response(sessionBody()));
  try {
    const client = initMythos({ expectedOrigin: 'https://mythos.test' });
    await client.ready;
    embedded.parentCalls.length = 0;
    client.relaunch();
    expect(embedded.parentCalls).toEqual([
      { data: { type: 'mythos:relaunch' }, origin: 'https://mythos.test' },
    ]);
  } finally {
    embedded.restore();
  }

  resetMythosClientForTests();
  const standalone = installFakeWindow({ embedded: false });
  standalone.fetchMock.mockResolvedValueOnce(response({ success: true, data: null }));
  try {
    const client = initMythos();
    await client.ready;
    client.relaunch();
    expect(standalone.parentCalls).toEqual([]);
  } finally {
    standalone.restore();
  }
});

test('initMythos is a singleton and ignores later options', async () => {
  const fake = installFakeWindow();
  fake.storage.set('mythos:transport', 'cookie');
  fake.fetchMock.mockResolvedValueOnce(response(sessionBody()));
  try {
    const first = initMythos({ sessionPath: '/first' });
    const second = initMythos({ sessionPath: '/second' });
    expect(second).toBe(first);
    await first.ready;
    expect(fake.fetchMock.mock.calls[0][0]).toBe('/first');
  } finally {
    fake.restore();
  }
});

test('sandboxed storage falls back to memory without preventing a Mythos session', async () => {
  const fake = installFakeWindow({ storageThrows: true });
  fake.fetchMock
    .mockResolvedValueOnce(response(sessionBody('memory-token')))
    .mockResolvedValueOnce(response({ success: true, data: null }));
  try {
    expect(await initMythos().ready).toMatchObject({ status: 'mythos', session: SESSION });
  } finally {
    fake.restore();
  }
});
