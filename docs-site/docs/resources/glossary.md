# Glossary

These terms describe the Mythos launch and billing model used throughout the SDK docs.

| Term | Definition |
|---|---|
| **Producer** | App developer who integrates the SDK and lists an app on Mythos |
| **Consumer** | User who buys credits and spends them across Mythos apps |
| **Listing** | A published app entry in the Mythos marketplace |
| **Launch session** | Secure context connecting a Consumer, listing, and billing identity |
| **Standalone** | App state when it was opened outside a Mythos launch |
| **Charge confirmation** | Consumer approval returned by `confirmCharge` before a billable action |
| **Consent ID** | Approval identifier that can be passed to the server charge |
| **Idempotency key** | Client-generated UUID reused for retries of one fixed-price action |
| **Session metered total** | Running credit total returned by `charge` |
| **LLM gateway** | Mythos-routed OpenAI-compatible client returned by `mythos.llm` |
| **Well-known route** | Standard integration endpoint under `/.well-known/` |
