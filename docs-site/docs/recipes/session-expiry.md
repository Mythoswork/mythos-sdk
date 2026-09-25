# Session expiry

When `useMythos` or `initMythos` reports `status === 'expired'`, stop billable actions and offer a relaunch.

```tsx
if (status === 'expired') {
  return <button onClick={relaunch}>Session expired — relaunch</button>;
}
```

`relaunch()` asks the Mythos dashboard to launch the listing again. Outside the dashboard, explain that the user must reopen the app from Mythos.

:::caution Known limitation
Until backend issue #179 ships, fixed charges return `SESSION_EXPIRED` about five minutes after launch. Handle that error as an expired session and offer the same relaunch action.
:::
