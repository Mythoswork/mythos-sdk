import { decodeJwt, errors } from 'jose';

import { consumeSession, meterSession, readErrorCode, readIdentityFields, type MeterResult } from './api-client';
import { getLlmBillingMetadata } from './billing-metadata';
import { loadConfig } from './config';
import {
  InvalidLaunchTokenError,
  LaunchTokenConsumedError,
  MythosConfigError,
  MythosError,
  MythosUpstreamError,
  SessionExpiredError,
  SessionRequiredError,
} from './errors';
import { mythosLog } from './logger';
import { extractLaunchToken } from './query';
import { openSession, sealSession, type StoredSession } from './session';
import type { MythosSession } from './types';
import { SDK_VERSION } from './version';
import { verifyLaunchToken } from './verify';
import type OpenAI from 'openai';
import type { LlmOptions, MythosLlmBillingMetadata } from './llm';

export type HeaderBag = Headers | Record<string, string | string[] | undefined>;

export interface MythosRequestLike {
  headers: HeaderBag;
}

export const MYTHOS_SESSION_COOKIE = 'mythos_session';
export const MYTHOS_SESSION_HEADER = 'x-mythos-session';
export const DEFAULT_SESSION_TTL_SECONDS = 1800;
export const MIN_SESSION_SECRET_LENGTH = 32;

export interface CreateMythosOptions {
  resolveListingIds?: () => Promise<string[]>;
  onListingRegistered?: (listingId: string) => Promise<void>;
}

export type PublicSession = Pick<MythosSession, 'userId' | 'email' | 'displayName' | 'listingId' | 'sessionJti'>;

export interface ChargeOptions {
  credits: number;
  reason?: string;
  idempotencyKey?: string;
  consentId?: string;
}

export type ChargeResult = MeterResult;

export interface Mythos {
  handlers: { GET: (request: Request) => Promise<Response>; POST: (request: Request) => Promise<Response> };
  handle(request: Request): Promise<Response>;
  getSession(req: MythosRequestLike): Promise<PublicSession | null>;
  charge(req: MythosRequestLike, options: ChargeOptions): Promise<ChargeResult>;
  /** Returns the caller's OpenAI client type (`mythos.llm<OpenAI>(req, …)`); `fallback` should be the same type. */
  llm<TClient = OpenAI>(req: MythosRequestLike, options?: LlmOptions<TClient>): Promise<TClient>;
  billing(completion: unknown): MythosLlmBillingMetadata | null;
}

function readHeader(req: MythosRequestLike, name: string): string | undefined {
  const headers = req.headers;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function readCookie(req: MythosRequestLike, name: string): string | undefined {
  const raw = readHeader(req, 'cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function publicOf(session: MythosSession): PublicSession {
  return {
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    listingId: session.listingId,
    sessionJti: session.sessionJti,
  };
}

function json(status: number, body: unknown, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function unverifiedJti(token: string): string | undefined {
  try {
    const jti = decodeJwt(token).jti;
    return typeof jti === 'string' ? jti : undefined;
  } catch {
    return undefined;
  }
}

function errorResponse(err: unknown): Response {
  if (err instanceof MythosError) {
    if (err.httpStatus >= 500) mythosLog.error('request failed', { code: err.code, message: err.message });
    return json(err.httpStatus, { success: false, error: err.message, code: err.code });
  }
  mythosLog.error('request: unexpected error', err);
  return json(500, { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
}

function buildSessionCookie(token: string, expiresAt: string, request: Request): string {
  const forwardedProto = readHeader(request, 'x-forwarded-proto')?.split(',')[0].trim();
  const isHttps = new URL(request.url).protocol === 'https:' || forwardedProto === 'https';
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  const attributes = isHttps
    ? 'SameSite=None; Secure; Partitioned'
    : 'SameSite=Lax';
  return `${MYTHOS_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Max-Age=${maxAge}; ${attributes}`;
}

export function createMythos(options: CreateMythosOptions = {}): Mythos {
  const secret = process.env.MYTHOS_SESSION_SECRET;
  if (!secret) {
    throw new MythosConfigError('MYTHOS_SESSION_SECRET is not set. Generate one with: openssl rand -base64 32');
  }
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new MythosConfigError(`MYTHOS_SESSION_SECRET must be at least 32 characters (got ${secret.length})`);
  }

  const configuredApiUrl = process.env.MYTHOS_API_URL;
  if (configuredApiUrl !== undefined) {
    try {
      const { protocol } = new URL(configuredApiUrl);
      if (protocol !== 'http:' && protocol !== 'https:') throw new TypeError('Unsupported protocol');
    } catch {
      throw new MythosConfigError('MYTHOS_API_URL is not a valid http(s) URL');
    }
  }

  const config = loadConfig();
  if (config.listingIds.length === 0 && !options.resolveListingIds) {
    throw new MythosConfigError('MYTHOS_LISTING_ID (or MYTHOS_LISTING_IDS) is not set');
  }
  mythosLog.debug('createMythos: config ok', { apiUrl: config.apiUrl, listingIds: config.listingIds });

  function readStoredSession(req: MythosRequestLike): StoredSession | null {
    const cookieToken = readCookie(req, MYTHOS_SESSION_COOKIE);
    if (cookieToken) {
      const session = openSession(cookieToken);
      if (session) return session;
    }
    const headerToken = readHeader(req, MYTHOS_SESSION_HEADER);
    return headerToken ? openSession(headerToken) : null;
  }

  async function handleHandshake(request: Request): Promise<Response> {
    const token = extractLaunchToken(new URL(request.url).searchParams.get('lt'));
    if (!token) return json(401, { error: 'Missing launch token' });
    try {
      const { validateHandshakeToken } = await import('./handshake');
      await validateHandshakeToken(token);
    } catch (err) {
      if (err instanceof errors.JOSEError) return json(401, { error: 'Invalid launch token' });
      mythosLog.error('handshake: validation failed', err);
      return json(503, { error: 'Service unavailable' });
    }
    return json(200, { ok: true, sdk_version: SDK_VERSION });
  }

  async function handleListingRegistered(request: Request): Promise<Response> {
    if (!options.onListingRegistered) {
      return json(404, { success: false, error: 'Not found', code: 'NOT_FOUND' });
    }
    const token = extractLaunchToken(new URL(request.url).searchParams.get('lt'));
    if (!token) return json(401, { error: 'Missing listing callback token' });
    try {
      const { validateListingCallbackToken } = await import('./listing-callback');
      const listingId = await validateListingCallbackToken(token);
      await options.onListingRegistered(listingId);
    } catch (err) {
      if (err instanceof errors.JOSEError) return json(401, { error: 'Invalid listing callback token' });
      mythosLog.error('listing-callback: unexpected error', err);
      return json(503, { error: 'Service unavailable' });
    }
    return json(200, { ok: true });
  }

  async function handleSession(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const token = extractLaunchToken(url.searchParams.get('lt'));
    const existing = readStoredSession(request);
    const sessionResponse = (
      session: StoredSession,
      cookie?: string,
      sessionToken = sealSession(session),
    ): Response => {
      const response = json(200, { success: true, data: { session: publicOf(session), sessionToken } });
      if (cookie) response.headers.append('set-cookie', cookie);
      return response;
    };

    if (!token) {
      return existing ? sessionResponse(existing) : json(200, { success: true, data: null });
    }

    let incoming: MythosSession;
    try {
      incoming = await verifyLaunchToken(token, { resolveListingIds: options.resolveListingIds });
    } catch (err) {
      if (existing && unverifiedJti(token) === existing.sessionJti) return sessionResponse(existing);
      if (err instanceof MythosConfigError) {
        mythosLog.error('session: invalid SDK configuration', err);
        return json(500, { success: false, error: err.message, code: 'CONFIG_ERROR' });
      }
      if (err instanceof InvalidLaunchTokenError || err instanceof errors.JOSEError) {
        return json(401, { success: false, error: 'Invalid launch token', code: 'INVALID_LAUNCH_TOKEN' });
      }
      mythosLog.error('session: could not verify launch token (JWKS/network)', err);
      return json(503, {
        success: false,
        error: 'Could not reach Mythos to verify the launch',
        code: 'MYTHOS_UNREACHABLE',
      });
    }

    if (existing && existing.sessionJti === incoming.sessionJti) return sessionResponse(existing);

    let consumeResponse: Response;
    try {
      consumeResponse = await consumeSession(incoming.sessionJti);
    } catch (err) {
      mythosLog.error('session: consume request failed', err);
      return json(503, { success: false, error: 'Could not reach Mythos to consume the session', code: 'MYTHOS_UNREACHABLE' });
    }
    if (consumeResponse.status === 409) {
      const consumed = new LaunchTokenConsumedError();
      return json(consumed.httpStatus, { success: false, error: consumed.message, code: consumed.code });
    }
    if (!consumeResponse.ok) {
      const code = await readErrorCode(consumeResponse);
      mythosLog.error(`session: consume returned ${consumeResponse.status}`, { code, jti: incoming.sessionJti });
      if (code === 'SESSION_EXPIRED') {
        const expired = new SessionExpiredError('Launch expired — relaunch from Mythos');
        return json(expired.httpStatus, { success: false, error: expired.message, code: expired.code });
      }
      const upstream = new MythosUpstreamError('Mythos consume failed', consumeResponse.status, code);
      return json(upstream.httpStatus, { success: false, error: upstream.message, code: upstream.code });
    }

    let consumeBody: unknown = null;
    try {
      consumeBody = await consumeResponse.json();
    } catch {
      // Session verification succeeded; identity credentials remain optional.
    }
    const identity = readIdentityFields(consumeBody);
    if (!identity) mythosLog.warn('session: consume returned no LLM identity token; mythos.llm() may use fallback');
    const stored: StoredSession = {
      ...incoming,
      ...(identity ?? {}),
      expiresAt: identity?.llmIdentityExpiresAt ?? new Date(Date.now() + DEFAULT_SESSION_TTL_SECONDS * 1000).toISOString(),
    };
    const sealed = sealSession(stored);
    return sessionResponse(stored, buildSessionCookie(sealed, stored.expiresAt, request), sealed);
  }

  async function handle(request: Request): Promise<Response> {
    try {
      const segment = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
      if (segment === 'session' && (request.method === 'GET' || request.method === 'POST')) {
        return await handleSession(request);
      }
      if ((segment === 'handshake' || segment === 'mythos-handshake') && request.method === 'GET') {
        return await handleHandshake(request);
      }
      if (
        (segment === 'listing-registered' || segment === 'mythos-listing-registered') &&
        (request.method === 'GET' || request.method === 'POST')
      ) {
        return await handleListingRegistered(request);
      }
      if (segment === 'session' || segment === 'handshake' || segment === 'mythos-handshake') {
        return json(405, { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
      }
      return json(404, { success: false, error: 'Not found', code: 'NOT_FOUND' });
    } catch (err) {
      return errorResponse(err);
    }
  }

  return {
    handlers: { GET: handle, POST: handle },
    handle,
    async getSession(req) {
      const session = readStoredSession(req);
      return session ? publicOf(session) : null;
    },
    async charge(req, chargeOptions) {
      const session = readStoredSession(req);
      if (!session) throw new SessionRequiredError();
      if (chargeOptions.consentId) mythosLog.debug('charge: consentId accepted (enforced in Phase 3)');
      try {
        return await meterSession(
          session.sessionJti,
          chargeOptions.credits,
          chargeOptions.reason,
          chargeOptions.idempotencyKey,
        );
      } catch (err) {
        if (err instanceof MythosError && err.httpStatus >= 500) {
          mythosLog.error('charge failed', { code: err.code, jti: session.sessionJti });
        }
        throw err;
      }
    },
    async llm<TClient = OpenAI>(req: MythosRequestLike, llmOptions: LlmOptions<TClient> = {}): Promise<TClient> {
      const session = readStoredSession(req);
      if (!session) {
        if (llmOptions.fallback !== undefined) return llmOptions.fallback;
        throw new MythosError('An active Mythos session is required for LLM access', 'LLM_SESSION_REQUIRED');
      }
      if (session && !session.llmIdentityToken) {
        mythosLog.warn('llm: session has no LLM identity token (backend identity key misconfigured?)');
        if (llmOptions.fallback !== undefined) return llmOptions.fallback;
        throw new MythosError('The Mythos session is missing its LLM identity token', 'LLM_IDENTITY_REQUIRED');
      }
      const { llm: buildLlm } = await import('./llm');
      // ponytail: the gateway client is an instance of the caller's own `openai` peer. Typing it as the
      // caller's TClient avoids a CJS (index.d.ts) vs ESM (index.d.mts) OpenAI type clash in bundler projects.
      return buildLlm(session, llmOptions) as unknown as TClient;
    },
    billing(completion) {
      return getLlmBillingMetadata(completion);
    },
  };
}
