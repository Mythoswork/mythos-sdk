import type { IncomingMessage, ServerResponse } from 'http';

import type { Mythos } from './mythos';

export function toNodeHandler(
  mythos: Mythos,
  pathOf: (req: IncomingMessage) => string = (req) => req.url ?? '/',
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim();
    const url = `${proto}://${req.headers.host ?? 'localhost'}${pathOf(req)}`;
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const response = await mythos.handle(new Request(url, { method: req.method, headers }));
    res.statusCode = response.status;
    response.headers.forEach((value, name) => {
      if (name !== 'set-cookie') res.setHeader(name, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader('set-cookie', cookies);
    res.end(await response.text());
  };
}
