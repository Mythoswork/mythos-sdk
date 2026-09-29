import { createRequire } from 'module';
import type { NextFunction, Request, Response, Router } from 'express';

import type { Mythos } from './mythos';
import { toNodeHandler } from './node-http';

const requireFromSdk = createRequire(__filename);

export const MYTHOS_EXPRESS_PATHS = [
  '/api/mythos/:action',
  '/.well-known/mythos-handshake',
  '/.well-known/mythos-listing-registered',
];

export function mythosExpress(mythos: Mythos): Router {
  const express = requireFromSdk('express') as typeof import('express');
  const router = express.Router();
  const handle = toNodeHandler(mythos, (req) => (req as Request).originalUrl ?? req.url ?? '/');
  router.all(MYTHOS_EXPRESS_PATHS, (req: Request, res: Response, next: NextFunction) => {
    handle(req, res).catch(next);
  });
  return router;
}
