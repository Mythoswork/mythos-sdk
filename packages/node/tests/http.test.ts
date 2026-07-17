import { MYTHOS_HTTP_TIMEOUT_MS, mythosRequest } from '../src/http';

beforeEach(() => {
  (global as unknown as { fetch: jest.Mock }).fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, status: 200 });
});

test('mythosRequest prepends apiUrl and attaches an AbortSignal timeout', async () => {
  await mythosRequest('/.well-known/jwks.json', { method: 'GET' });

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
  expect(url).toBe('https://api.mythos.work/.well-known/jwks.json');
  expect(init.signal).toBeDefined();
  expect(init.method).toBe('GET');
  expect(MYTHOS_HTTP_TIMEOUT_MS).toBe(5_000);
});
