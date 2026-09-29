# Errors

Every SDK error is a `MythosError`. Node errors expose `.code` and `.httpStatus`; Python errors expose `.code` and `.http_status`.

| Code | HTTP | Meaning |
|---|---:|---|
| `CONFIG_ERROR` | 500 | Bad or missing environment configuration; raised at startup by `createMythos()` |
| `INVALID_LAUNCH_TOKEN` | 401 | Invalid launch token |
| `TOKEN_ALREADY_CONSUMED` | 401 | Launch token was reused |
| `SESSION_REQUIRED` | 401 | `charge` was called without a session |
| `SESSION_EXPIRED` | 401 | Session expired |
| `INSUFFICIENT_FUNDS` | 402 | Wallet balance is too low |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `INVALID_USAGE` | 400 | Invalid charge input, such as non-integer credits |
| `UPSTREAM_ERROR` | 502 | Mythos returned an upstream error |
| `MYTHOS_UNREACHABLE` | 503 | Mythos could not be reached |
| `LLM_SESSION_REQUIRED` | — | `llm()` has no session and no fallback |
| `LLM_IDENTITY_REQUIRED` | — | `llm()` has no identity token and no fallback |

## Node mapping

```ts
if (err instanceof MythosError) res.status(err.httpStatus).json({ success: false, error: err.message, code: err.code });
```

## Python mapping

```python
if isinstance(err, MythosError): return JSONResponse({"success": False, "error": str(err), "code": err.code}, status_code=err.http_status)
```
