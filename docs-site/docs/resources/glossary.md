# Glossary

Terms used throughout the Mythos SDK documentation.

| Term | Definition |
|------|------------|
| **Producer** | App developer who integrates the SDK and lists on the Mythos marketplace |
| **Consumer** | End user who discovers and launches Producer apps via Mythos |
| **Listing** | A published app entry on the Mythos marketplace |
| **Listing ID** | UUID identifying your listing — used in `aud` claim validation |
| **Launch token** | RS256 JWT in `?lt=` query param when Consumer opens your app |
| **Handshake token** | JWT with `purpose: "handshake-check"` for publish gate |
| **Listing registered token** | JWT with `purpose: "listing_registered"` for dynamic ID callback |
| **sessionJti** | Session identifier (`jti` claim) — use for `reportUsage` / `report_usage` |
| **JWKS** | JSON Web Key Set — Mythos public keys for RS256 verification |
| **Consume** | `POST /api/apps/sessions/{jti}/consume` — marks launch token single-use |
| **Meter** | `POST /api/apps/sessions/{jti}/meter` — debits Consumer wallet |
| **charge_id** | Per-call idempotency key sent with meter requests |
| **ADR-0003** | Architecture decision: single-use consume is mandatory and non-skippable |
| **Well-known routes** | Standard paths under `/.well-known/` for Mythos platform integration |

## See also

- [How it works](../getting-started/how-it-works.md)
- [Token types](../concepts/token-types.md)
