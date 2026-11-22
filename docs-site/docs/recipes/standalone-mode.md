# Standalone mode

The same app can work both inside and outside Mythos.

In the browser, `status === 'standalone'` means the page was not launched through Mythos. On the server, `await mythos.getSession(req) === null` means the same thing. In that branch, use your existing authentication and paywall instead of Mythos billing.

```ts
const session = await mythos.getSession(req);
if (!session) return handleWithYourOwnAuth(req);
```

For LLM calls in apps that also serve their own signed-in users, `standalone: true` (Python `standalone=True`) gives a plain OpenAI client on your own key when there is no Mythos session. You pay for those calls, so put the route behind your own login:

```ts
const client = await mythos.llm(req, { apiKey: process.env.OPENAI_API_KEY, standalone: true });
```

A session always wins: `standalone` never replaces a real Mythos session. Pass `fallback` only for a custom endpoint you build yourself; it takes precedence over `standalone`. Without a session, without `standalone` and without `fallback`, `llm()` throws `LLM_SESSION_REQUIRED` or `LLM_IDENTITY_REQUIRED`.

In the browser, `confirmCharge` outside Mythos asks nobody and resolves `{ approved: false, standalone: true }`, so branch on the result instead of on `status`:

```ts
const result = await confirmCharge({ usd: 0.15, reason: 'calculate' });
if (result.standalone) return runWithOwnPaywall();
if (result.approved) await fetch('/api/calculate', { method: 'POST' });
```

On the server, call `mythos.charge` only when `getSession` returns a session.
