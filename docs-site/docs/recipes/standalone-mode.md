# Standalone mode

The same app can work both inside and outside Mythos.

In the browser, `status === 'standalone'` means the page was not launched through Mythos. On the server, `await mythos.getSession(req) === null` means the same thing. In that branch, use your existing authentication and paywall instead of Mythos billing.

```ts
const session = await mythos.getSession(req);
if (!session) return handleWithYourOwnAuth(req);
```

For LLM calls, `standalone: true` gives a plain OpenAI client with your own key when there is no Mythos session:

```ts
const client = await mythos.llm(req, { apiKey: process.env.OPENAI_API_KEY, standalone: true });
```

A session always wins: `standalone` never replaces a real Mythos session. Pass `fallback` only for a custom endpoint you build yourself; it takes precedence over `standalone`. Without a session, without `standalone` and without `fallback`, `llm()` throws `LLM_SESSION_REQUIRED` or `LLM_IDENTITY_REQUIRED`.

In the browser, `confirmCharge` outside Mythos approves without a popup and resolves `{ approved: true, standalone: true }`. You don't need to branch on `status` around it. On the server, call `mythos.charge` only when `getSession` returns a session.
