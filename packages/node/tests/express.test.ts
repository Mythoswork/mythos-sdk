import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

import express from 'express';

import { mythosExpress } from '../src/express';
import { createMythos } from '../src/mythos';

let server: Server | null = null;

beforeEach(() => {
  process.env.MYTHOS_SESSION_SECRET = 'x'.repeat(32);
  delete process.env.MYTHOS_LISTING_ID;
  delete process.env.MYTHOS_LISTING_IDS;
});

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
  server = null;
});

async function listen(app: express.Express): Promise<string> {
  server = createServer(app);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function createTestMythos() {
  return createMythos({ resolveListingIds: async () => ['listing-1'] });
}

test('serves the session endpoint without a cookie', async () => {
  const app = express();
  app.use(mythosExpress(createTestMythos()));
  const baseUrl = await listen(app);

  const response = await fetch(`${baseUrl}/api/mythos/session`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: null });
});

test('serves the well-known handshake without rewrites', async () => {
  const app = express();
  app.use(mythosExpress(createTestMythos()));
  const baseUrl = await listen(app);

  const response = await fetch(`${baseUrl}/.well-known/mythos-handshake`);

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'Missing launch token' });
});

test('dispatches correctly when mounted under a prefix', async () => {
  const app = express();
  app.use('/sub', mythosExpress(createTestMythos()));
  const baseUrl = await listen(app);

  const response = await fetch(`${baseUrl}/sub/api/mythos/session`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: null });
});
