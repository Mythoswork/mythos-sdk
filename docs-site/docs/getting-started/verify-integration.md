# Verify your integration

Run the SDK doctor after wiring the integration:

```bash
npx @mythos-work/sdk doctor
# FastAPI projects can also use:
python -m mythos_sdk doctor
```

Doctor validates configuration, API reachability, listing IDs, route wiring, Next.js rewrites, and the installed SDK version. Fix every failed check before deploying.

## Dashboard test launch

1. Start or deploy your app over HTTPS.
2. Open the listing in the Mythos dashboard and run a test launch.
3. Confirm the UI reaches the `mythos` status.
4. Approve and complete one billed action.
5. Confirm the charge appears in Mythos.

If the launch fails, run doctor in the same environment as the deployed app and use [Troubleshooting](../resources/troubleshooting.md).
