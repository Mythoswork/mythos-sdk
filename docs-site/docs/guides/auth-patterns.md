:::caution Advanced — 0.0.x primitives
You don't need this page for a normal integration. Use the [quickstarts](/getting-started/quickstart-nextjs-app) and `createMythos()` instead. These low-level functions remain exported for custom setups.
:::

# Auth patterns

Wire Mythos launch auth alongside your existing authentication gate.

:::info
**Just getting started?** [Browser client](../getting-started/browser-client.md) covers current session handling.
:::

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

- [Browser client](../getting-started/browser-client.md)
- [Launch sessions](../concepts/launch-sessions.md)
- [Use with AI agents](../ai-agents.md)
