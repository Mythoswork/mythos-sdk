# Auth patterns

Wire Mythos launch auth alongside your existing authentication gate.

{% hint style="info" %}
**Just getting started?** [Frontend client](frontend-client.md) covers `?lt=` handling.
{% endhint %}

## Core rule

Check for `?lt=` **before** your existing auth gate. On successful Mythos session exchange, skip the manual auth step for that visit.

## Pattern reference

| Existing auth | Approach |
|---------------|----------|
| Password gate / modal | Call `initMythosFromUrl()` on load; if session returned, skip password prompt |
| OAuth (Google, GitHub, etc.) | Mythos launch is an alternative entry path; direct visits still use OAuth |
| No auth | Mythos session becomes the only auth when launched from platform |
| API key / Bearer | Mythos session is separate — Consumer identity comes from launch token claims |

## Password gate example

```typescript
async function initApp() {
  await initMythosFromUrl();
  if (getMythosSession()) {
    showDashboard();
    return;
  }
  showPasswordModal();
}
```

## OAuth coexistence

Consumers who open your app from Mythos never see your OAuth login — they are already authenticated via the launch token. Users who visit your URL directly still go through OAuth.

Do not try to merge Mythos `userId` with OAuth provider IDs unless you have an explicit account-linking product requirement.

## Session storage

Store `sessionJti` in memory or sessionStorage for the page lifetime. Do not persist the raw `?lt=` JWT. The token is single-use and already consumed server-side.

## Logout / refresh

Refreshing the page without a new `?lt=` param will not restore Mythos auth. The Consumer must re-launch from the Mythos marketplace for a new session.

## Next steps

- [Frontend client](frontend-client.md)
- [Launch sessions](../concepts/launch-sessions.md)
- [AI integration prompt](ai-integration-prompt.md)
