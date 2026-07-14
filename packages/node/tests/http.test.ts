import { MYTHOS_HTTP_TIMEOUT_MS, mythosRequest } from '../src/http';

beforeEach(() => {
  (global as unknown as { fetch: jest.Mock }).fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, status: 200 });
});

test('mythosRequest attaches an AbortSignal timeout', async () => {
  await mythosRequest('https://api.mythos.work/.well-known/jwks.json', { method: 'GET' });

  const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
  expect(init.signal).toBeDefined();
  expect(init.method).toBe('GET');
  expect(MYTHOS_HTTP_TIMEOUT_MS).toBe(5_000);
});
