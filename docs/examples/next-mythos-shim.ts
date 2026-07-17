/**
 * Adapter that runs @mythos-work/sdk Express handlers inside Next.js Route Handlers.
 * Copy to lib/mythos.ts in your Next.js app.
 */
import { handshakeRoute, requireLaunchToken, type MythosSession } from "@mythos-work/sdk";

type ShimReq = { query: Record<string, string | undefined>; mythos?: MythosSession };
type ShimRes = {
  status: (code: number) => ShimRes;
  json: (body: unknown) => void;
};
type ExpressLikeHandler = (req: ShimReq, res: ShimRes, next: () => void) => void | Promise<void>;

interface HandlerResult {
  status: number;
  body: unknown;
}

function runExpressHandler(handler: ExpressLikeHandler, lt: string | null): Promise<HandlerResult> {
  return new Promise((resolve) => {
    let statusCode = 200;
    const req: ShimReq = { query: { lt: lt ?? undefined } };
    const res: ShimRes = {
      status(code) {
        statusCode = code;
        return res;
      },
      json(body) {
        resolve({ status: statusCode, body });
      },
    };
    void handler(req, res, () => {
      resolve({ status: 200, body: { ok: true, session: req.mythos } });
    });
  });
}

export async function verifyAndConsumeLaunchToken(lt: string | null): Promise<HandlerResult> {
  return runExpressHandler(requireLaunchToken() as ExpressLikeHandler, lt);
}

export async function runHandshake(lt: string | null): Promise<HandlerResult> {
  return runExpressHandler(handshakeRoute() as unknown as ExpressLikeHandler, lt);
}
