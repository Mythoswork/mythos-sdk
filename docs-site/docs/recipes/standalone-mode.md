# Standalone mode

The same app can work both inside and outside Mythos.

In the browser, `status === 'standalone'` means the page was not launched through Mythos. On the server, `await mythos.getSession(req) === null` means the same thing. In that branch, use your existing authentication and paywall instead of Mythos billing.

```ts
const session = await mythos.getSession(req);
if (!session) return handleWithYourOwnAuth(req);
```

For LLM calls, provide an OpenAI fallback for standalone users:

```ts
const client = await mythos.llm(req, { apiKey: process.env.OPENAI_API_KEY, fallback: ownOpenAiClient });
```

Without a session and without `fallback`, `llm()` throws `LLM_SESSION_REQUIRED` or `LLM_IDENTITY_REQUIRED`.
