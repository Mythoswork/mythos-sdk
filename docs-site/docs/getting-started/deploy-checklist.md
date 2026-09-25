# Deploy checklist

Check every item in the deployed environment, not only on your laptop.

- [ ] `MYTHOS_SESSION_SECRET` is at least 32 characters and is set in the host environment, such as Vercel.
- [ ] `MYTHOS_LISTING_ID` is set to the listing ID from the Mythos dashboard.
- [ ] Express/FastAPI: variables are set in the host environment. `.env` files are not read in production unless your start command loads them (`node --env-file=.env`, `uvicorn --env-file .env`).
- [ ] The app uses HTTPS; the session cookie requires `Secure`.
- [ ] `https://your-app.example/.well-known/mythos-handshake` reaches the SDK handler.
- [ ] `npx @mythos-work/sdk doctor` passes every check.

After deployment, run a test launch from the Mythos dashboard and complete one billed action.
