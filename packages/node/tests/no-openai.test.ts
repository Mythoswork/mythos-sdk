jest.mock('openai', () => {
  throw new Error("Cannot find module 'openai'");
});

test('LLM fallback does not load the optional OpenAI peer without a session', async () => {
  process.env.MYTHOS_SESSION_SECRET = 'x'.repeat(32);
  process.env.MYTHOS_LISTING_ID = 'listing-abc';

  const { createMythos } = await import('../src/index');
  const fallback = { provider: 'standalone' };
  const mythos = createMythos();

  await expect(mythos.llm({ headers: {} }, { fallback })).resolves.toBe(fallback);
});
