import { confirmCharge, sendHandshake } from '../src/client';

type Listener = (event: { data: unknown; source: unknown }) => void;

interface FakeWindow {
  parent: unknown;
  crypto: { randomUUID: () => string };
  addEventListener: (type: string, fn: Listener) => void;
  removeEventListener: (type: string, fn: Listener) => void;
  setTimeout: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimeout: (id: NodeJS.Timeout) => void;
}

// client.ts reads `window` at call time (not import time), so each test
// installs its own fake on globalThis and restores it afterwards.
function installFakeWindow(embedded: boolean) {
  const listeners: Listener[] = [];
  const parentCalls: Array<{ data: unknown; origin: string }> = [];

  const win: FakeWindow = {
    parent: undefined,
    crypto: { randomUUID: () => 'fixed-request-id' },
    addEventListener: (_type, fn) => listeners.push(fn),
    removeEventListener: (_type, fn) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };

  const parent = embedded
    ? {
        postMessage: (data: unknown, origin: string) => {
          parentCalls.push({ data, origin });
        },
      }
    : win;
  win.parent = parent;

  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = win;

  return {
    restore: () => {
      (globalThis as { window?: unknown }).window = previous;
    },
    dispatchResponse: (data: unknown) => listeners.forEach((fn) => fn({ data, source: parent })),
    listenerCount: () => listeners.length,
    parentCalls,
  };
}

test('confirmCharge resolves false immediately when not embedded', async () => {
  const fake = installFakeWindow(false);
  try {
    const approved = await confirmCharge(1, 'add(1, 2)');
    expect(approved).toBe(false);
    expect(fake.parentCalls.length).toBe(0);
  } finally {
    fake.restore();
  }
});

test('confirmCharge resolves true on a matching approved response', async () => {
  const fake = installFakeWindow(true);
  try {
    const pending = confirmCharge(1, 'add(1, 2)');
    fake.dispatchResponse({
      type: 'mythos:confirm-charge-response',
      requestId: 'fixed-request-id',
      approved: true,
    });
    expect(await pending).toBe(true);
    expect(fake.listenerCount()).toBe(0);
  } finally {
    fake.restore();
  }
});

test('confirmCharge resolves false on a matching declined response', async () => {
  const fake = installFakeWindow(true);
  try {
    const pending = confirmCharge(1, 'add(1, 2)');
    fake.dispatchResponse({
      type: 'mythos:confirm-charge-response',
      requestId: 'fixed-request-id',
      approved: false,
    });
    expect(await pending).toBe(false);
  } finally {
    fake.restore();
  }
});

test('confirmCharge ignores responses with a mismatched requestId', async () => {
  const fake = installFakeWindow(true);
  try {
    const pending = confirmCharge(1, 'add(1, 2)');
    fake.dispatchResponse({
      type: 'mythos:confirm-charge-response',
      requestId: 'some-other-request-id',
      approved: true,
    });
    fake.dispatchResponse({
      type: 'mythos:confirm-charge-response',
      requestId: 'fixed-request-id',
      approved: true,
    });
    expect(await pending).toBe(true);
  } finally {
    fake.restore();
  }
});

test('confirmCharge resolves false and notifies the parent on timeout', async () => {
  const fake = installFakeWindow(true);
  try {
    const approved = await confirmCharge(1, 'add(1, 2)', 20);
    expect(approved).toBe(false);
    expect(fake.listenerCount()).toBe(0);
    const timeoutCall = fake.parentCalls.find(
      (c) => (c.data as { type?: string }).type === 'mythos:confirm-charge-timeout',
    );
    expect(timeoutCall).toBeTruthy();
    expect((timeoutCall!.data as { requestId?: string }).requestId).toBe('fixed-request-id');
  } finally {
    fake.restore();
  }
});

test('confirmCharge posts the confirm-charge request with credits and reason', async () => {
  const fake = installFakeWindow(true);
  try {
    const pending = confirmCharge(3, 'multiply(2, 4)');
    const requestCall = fake.parentCalls.find(
      (c) => (c.data as { type?: string }).type === 'mythos:confirm-charge',
    );
    expect(requestCall).toBeTruthy();
    expect(requestCall!.data).toEqual({
      type: 'mythos:confirm-charge',
      requestId: 'fixed-request-id',
      credits: 3,
      reason: 'multiply(2, 4)',
      kind: 'generic',
    });

    fake.dispatchResponse({
      type: 'mythos:confirm-charge-response',
      requestId: 'fixed-request-id',
      approved: true,
    });
    await pending;
  } finally {
    fake.restore();
  }
});

test('confirmCharge posts kind "llm" when explicitly requested', async () => {
  const fake = installFakeWindow(true);
  try {
    const pending = confirmCharge(3, 'chat: "hi"', undefined, 'llm');
    const requestCall = fake.parentCalls.find(
      (c) => (c.data as { type?: string }).type === 'mythos:confirm-charge',
    );
    expect(requestCall).toBeTruthy();
    expect((requestCall!.data as { kind?: string }).kind).toBe('llm');

    fake.dispatchResponse({
      type: 'mythos:confirm-charge-response',
      requestId: 'fixed-request-id',
      approved: true,
    });
    await pending;
  } finally {
    fake.restore();
  }
});

test('sendHandshake is a no-op with a console warning when not embedded', () => {
  const fake = installFakeWindow(false);
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    sendHandshake();
    expect(fake.parentCalls.length).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  } finally {
    warnSpy.mockRestore();
    fake.restore();
  }
});

test('sendHandshake posts the handshake message to the parent frame', () => {
  const fake = installFakeWindow(true);
  try {
    sendHandshake();
    expect(fake.parentCalls).toEqual([{ data: { type: 'mythos:handshake' }, origin: '*' }]);
  } finally {
    fake.restore();
  }
});
