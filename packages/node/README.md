# @mythos/sdk

Node.js / TypeScript SDK for Mythos producers.

## Install

```bash
npm install @mythos/sdk express
```

`express` is a peer dependency — required for `requireLaunchToken()` and `handshakeRoute()`.

## Development

```bash
npm ci
npm run build
npm test
```

## Browser bundles

This SDK is **server-only**. The `browser` export exists so bundlers fail fast with `NOT_IMPLEMENTED` if you accidentally import it client-side. Do not verify launch tokens in the browser.

## Publishing

```bash
npm run build
npm publish
```

`prepublishOnly` runs the TypeScript build automatically.
