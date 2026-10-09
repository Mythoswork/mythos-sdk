# Errors

Every SDK error is a `MythosError`. Node errors expose `.code` and `.httpStatus`; Python errors expose `.code` and `.http_status`.

| Code | HTTP | Meaning |
|---|---:|---|
| `CONFIG_ERROR` | 500 | Bad or missing environment configuration; raised at startup by `createMythos()` |
| `INVALID_LAUNCH_TOKEN` | 401 | Invalid launch token |
| `LISTING_NOT_REGISTERED` | 401 | Launch audience is not registered with this app |
| `PRODUCER_MISMATCH` | 401 | This app is bound to a different Mythos Producer. Check MYTHOS_KEY. |
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

Test launches report only the [diagnostic codes and messages](../resources/troubleshooting.md#test-launch-diagnostics). Real sessions never report. The diagnostic request contains exactly `code`, `step`, and `sdk_version`; reporting failures and its two-second timeout do not alter app responses. `charge()` and `llm()` rethrow the original `MythosError` unchanged.

`ProducerMismatchError` extends `InvalidLaunchTokenError` in both languages, preserving legacy invalid-token handling. Producer binding applies to launch, handshake and callback tokens; see the [configuration matrix](./configuration.md).

| Endpoint | HTTP | Mismatch body |
|---|---|---|
| Session (`handleSession` / Python session route) | 401 | `{"success":false,"error":"This app is bound to a different Mythos Producer. Check MYTHOS_KEY.","code":"PRODUCER_MISMATCH"}` |
| Handshake | 401 | `{"error":"Producer mismatch"}` |
| Listing callback | 401 | `{"error":"Producer mismatch"}`; registration callback is not invoked |
| Legacy `requireLaunchToken` / `require_launch_token` | 401 | Existing invalid-token response |

The backend surfaces `Producer mismatch` to the Producer; preserve this exact copy. Logs contain only the endpoint's `producer mismatch` message and `listingId`, never the key, `pkh` or token.

```ts
if (err instanceof MythosError) res.status(err.httpStatus).json({ success: false, error: err.message, code: err.code });
```

## Python mapping

```python
if isinstance(err, MythosError): return JSONResponse({"success": False, "error": str(err), "code": err.code}, status_code=err.http_status)
```
