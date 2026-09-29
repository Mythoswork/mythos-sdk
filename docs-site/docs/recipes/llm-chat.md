# LLM chat

Ask for approval in the browser, then route the completion through the Mythos LLM gateway on the server.

LLM cost is usage-based — provider cost plus your margin, settled after the response — so the dialog shows no amount and you pass no credits.

```ts
const { approved } = await confirmCharge({ kind: 'llm', reason: 'chat' });
if (approved) await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ message }) });
```

```ts
const client = await mythos.llm(req, { apiKey: process.env.OPENAI_API_KEY });
const completion = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: message }],
});
const billing = mythos.billing(completion);
return Response.json({ completion, billing });
```

`mythos.billing(completion)` returns Mythos billing metadata when the completion contains it, otherwise `null`.
