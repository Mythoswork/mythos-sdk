jest.mock('express', () => {
  throw new Error("Cannot find module 'express'");
});

test('root SDK and createMythos do not require Express, while web handshake still works', async () => {
  process.env.MYTHOS_SESSION_SECRET = 'x'.repeat(32);
  process.env.MYTHOS_LISTING_ID = 'listing-abc';
  process.env.MYTHOS_API_URL = 'https://api.mythos.work';

  const { createMythos } = await import('../src/index');
  const mythos = createMythos();
  const response = await mythos.handle(new Request('https://app.test/.well-known/mythos-handshake'));

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'Missing launch token' });
});
