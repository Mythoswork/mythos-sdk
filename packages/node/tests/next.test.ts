import type { IncomingMessage, ServerResponse } from 'http';

import { pagesHandler } from '../src/next';
import type { Mythos } from '../src/mythos';

test('Pages Router adapter relays status, body and multiple set-cookie headers', async () => {
  const setHeader = jest.fn();
  const end = jest.fn();
  const sdk = {
    handle: jest.fn(async () => {
      const response = new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
      response.headers.append('set-cookie', 'one=1; Path=/; HttpOnly');
      response.headers.append('set-cookie', 'two=2; Path=/; Secure');
      return response;
    }),
  } as unknown as Mythos;
  const handler = pagesHandler(sdk);
  const req = {
    method: 'GET',
    url: '/api/mythos/session?lt=launch',
    headers: { host: 'app.test', 'x-forwarded-proto': 'https' },
  } as unknown as IncomingMessage;
  const res = { statusCode: 0, setHeader, end } as unknown as ServerResponse;

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(setHeader).toHaveBeenCalledWith('set-cookie', expect.arrayContaining([
    expect.stringContaining('one=1'),
    expect.stringContaining('two=2'),
  ]));
  expect(end).toHaveBeenCalledWith(JSON.stringify({ success: true, data: null }));
});

test('Pages Router adapter preserves rewritten well-known request paths', async () => {
  const setHeader = jest.fn();
  const end = jest.fn();
  const sdk = {
    handle: jest.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe('/.well-known/mythos-handshake');
      return new Response(JSON.stringify({ error: 'Missing launch token' }), { status: 401 });
    }),
  } as unknown as Mythos;
  const handler = pagesHandler(sdk);
  const req = {
    method: 'GET',
    url: '/.well-known/mythos-handshake',
    headers: { host: 'app.test', 'x-forwarded-proto': 'https' },
  } as unknown as IncomingMessage;
  const res = { statusCode: 0, setHeader, end } as unknown as ServerResponse;

  await handler(req, res);

  expect(res.statusCode).toBe(401);
  expect(end).toHaveBeenCalledWith(JSON.stringify({ error: 'Missing launch token' }));
});
