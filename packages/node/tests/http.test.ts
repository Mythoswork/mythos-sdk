import { MYTHOS_HTTP_TIMEOUT_MS, mythosFetch } from '../src/http';

beforeEach(() => {
  (global as unknown as { fetch: jest.Mock }).fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, status: 200 });
});

test('mythosFetch attaches an AbortSignal timeout', async () => {
  await mythosFetch('https://api.mythos.work/.well-known/jwks.json');

  const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
  expect(init.signal).toBeDefined();
  expect(MYTHOS_HTTP_TIMEOUT_MS).toBe(5_000);
});
