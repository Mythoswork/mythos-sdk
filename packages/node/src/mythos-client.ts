import {
  MYTHOS_RELAUNCH_MESSAGE_TYPE,
  requestChargeConfirmation,
  sendHandshake,
  type ConfirmChargeResult,
} from './client';
import type { MythosSession } from './types';

export type MythosStatus = 'loading' | 'mythos' | 'standalone' | 'expired' | 'error';
export type MythosClientSession = Pick<
  MythosSession,
  'userId' | 'email' | 'displayName' | 'listingId' | 'sessionJti'
>;

export interface MythosClientState {
  status: MythosStatus;
  session: MythosClientSession | null;
  error: { code: string; message: string } | null;
}

export interface InitMythosOptions {
  sessionPath?: string;
  expectedOrigin?: string;
  confirmTimeoutMs?: number;
  autoRelaunch?: boolean;
}

/**
 * Fixed-price actions pass `credits`. LLM calls are usage-based (provider cost + margin,
 * settled after the response), so `kind: 'llm'` takes no credits.
 */
export type ConfirmChargeOptions =
  | { kind?: 'generic'; credits: number; reason?: string }
  | { kind: 'llm'; reason?: string };

export interface MythosClient {
  readonly state: MythosClientState;
  readonly ready: Promise<MythosClientState>;
  subscribe(listener: () => void): () => void;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  confirmCharge(options: ConfirmChargeOptions): Promise<ConfirmChargeResult>;
  relaunch(): void;
}

interface SessionResponseBody {
  success?: boolean;
  data?: { session?: MythosClientSession; sessionToken?: string; refreshAt?: string | null; expiresAt?: string | null } | null;
  code?: string;
  error?: string;
}

export const MYTHOS_SESSION_HEADER = 'X-Mythos-Session';
const TRANSPORT_KEY = 'mythos:transport';
const TOKEN_KEY = 'mythos:session-token';
const DEFAULT_SESSION_PATH = '/api/mythos/session';
const DEFAULT_CONFIRM_TIMEOUT_MS = 10_000;

let instance: MythosClient | null = null;
let cleanupInstance: (() => void) | null = null;

export function initMythos(options: InitMythosOptions = {}): MythosClient {
  if (instance) return instance;
  instance = createClient(options);
  return instance;
}

/** Test-only: drop the singleton so each test starts clean. */
export function resetMythosClientForTests(): void {
  cleanupInstance?.();
  cleanupInstance = null;
  instance = null;
}

function storageGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Sandboxed iframes retain the token in memory only.
  }
}

function storageRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function isEmbedded(): boolean {
  return window !== window.parent;
}

function isSameOrigin(input: RequestInfo | URL): boolean {
  try {
    const value = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    return new URL(value, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

async function readJson(response: Response): Promise<SessionResponseBody | null> {
  try {
    return (await response.json()) as SessionResponseBody;
  } catch {
    return null;
  }
}

function createClient(options: InitMythosOptions): MythosClient {
  const sessionPath = options.sessionPath ?? DEFAULT_SESSION_PATH;
  let state: MythosClientState = { status: 'loading', session: null, error: null };
  const listeners = new Set<() => void>();
  let transport = storageGet(TRANSPORT_KEY) as 'cookie' | 'header' | null;
  let memoryToken = transport === 'header' ? storageGet(TOKEN_KEY) : null;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshAt: number | null = null;
  let expiresAt: number | null = null;
  let relaunched = false;
  let disposed = false;

  const clearTimers = (): void => {
    clearTimeout(refreshTimer);
    clearTimeout(expiryTimer);
  };
  cleanupInstance = () => {
    disposed = true;
    clearTimers();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  const relaunch = (): void => {
    if (!isEmbedded()) return;
    try {
      window.parent.postMessage({ type: MYTHOS_RELAUNCH_MESSAGE_TYPE }, options.expectedOrigin ?? '*');
    } catch {
      // Relaunch is best-effort when the embedding origin is unavailable.
    }
  };

  const setState = (next: MythosClientState): void => {
    const shouldRelaunch = state.status !== 'expired' && next.status === 'expired' &&
      options.autoRelaunch !== false && !relaunched && isEmbedded();
    state = next;
    if (next.status === 'expired') {
      clearTimers();
      storageRemove(TRANSPORT_KEY);
      storageRemove(TOKEN_KEY);
      transport = null;
      memoryToken = null;
      refreshAt = null;
      expiresAt = null;
    }
    listeners.forEach((listener) => listener());
    if (shouldRelaunch) {
      relaunched = true;
      relaunch();
    }
  };

  const clampDelay = (ms: number): number => Math.min(Math.max(ms, 0), 2_147_483_000);
  const retryRefresh = (): MythosClientState => {
    if (disposed) return state;
    if (expiresAt !== null && Date.now() >= expiresAt) {
      setState({
        status: 'expired', session: null,
        error: { code: 'SESSION_EXPIRED', message: 'Mythos session expired' },
      });
      return state;
    }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void load('', true), 60_000);
    return state;
  };
  const load = async (search: string, isRefresh = false): Promise<MythosClientState> => {
    const sessionUrl = `${sessionPath}${search}`;
    const headers = new Headers();
    if (memoryToken && isSameOrigin(sessionUrl)) headers.set(MYTHOS_SESSION_HEADER, memoryToken);
    let response: Response;

    try {
      response = await window.fetch(sessionUrl, {
        credentials: 'same-origin',
        headers,
      });
    } catch (error) {
      if (isRefresh && state.status === 'mythos') return retryRefresh();
      setState({
        status: 'error',
        session: null,
        error: { code: 'NETWORK_ERROR', message: String(error) },
      });
      return state;
    }

    const body = await readJson(response);
    if (disposed) return state;
    if (body?.success === true && body.data === null) {
      if (isEmbedded() && transport !== null) {
        setState({
          status: 'expired',
          session: null,
          error: { code: 'SESSION_EXPIRED', message: 'Mythos session expired' },
        });
        return state;
      }

      storageRemove(TRANSPORT_KEY);
      storageRemove(TOKEN_KEY);
      transport = null;
      memoryToken = null;
      setState({ status: 'standalone', session: null, error: null });
      return state;
    }

    if (body?.success === true && body.data?.session) {
      const session = body.data.session;
      const token = body.data.sessionToken;

      if (transport === null) {
        try {
          const probe = await window.fetch(sessionPath, { credentials: 'same-origin' });
          const probeBody = await readJson(probe);
          transport =
            probeBody?.success === true && probeBody.data?.session?.sessionJti === session.sessionJti
              ? 'cookie'
              : 'header';
        } catch {
          transport = 'header';
        }
        storageSet(TRANSPORT_KEY, transport);
      }

      if (transport === 'header' && typeof token === 'string' && token.trim().length > 0) {
        memoryToken = token;
        storageSet(TOKEN_KEY, token);
      } else if (transport === 'header') {
        transport = null;
        memoryToken = null;
        storageRemove(TRANSPORT_KEY);
        storageRemove(TOKEN_KEY);
        setState({
          status: 'error',
          session: null,
          error: { code: 'INVALID_SESSION_RESPONSE', message: 'Session verification failed' },
        });
        return state;
      } else {
        memoryToken = null;
        storageRemove(TOKEN_KEY);
      }

      setState({ status: 'mythos', session, error: null });
      clearTimers();
      refreshAt = typeof body.data.refreshAt === 'string' ? Date.parse(body.data.refreshAt) : null;
      expiresAt = typeof body.data.expiresAt === 'string' ? Date.parse(body.data.expiresAt) : null;
      if (refreshAt !== null && Number.isFinite(refreshAt)) {
        // A backend without refresh may return an already-past refreshAt. Retry without a tight loop.
        const remaining = refreshAt - Date.now();
        refreshTimer = setTimeout(() => void load('', true), clampDelay(remaining > 0 ? remaining : 60_000));
      }
      if (expiresAt !== null && Number.isFinite(expiresAt)) {
        expiryTimer = setTimeout(() => void load('', true), clampDelay(expiresAt - Date.now() + 1000));
      }
      if (!isRefresh) {
        try {
          sendHandshake(options.expectedOrigin);
        } catch {
          // Session state remains usable when the embedding frame rejects postMessage.
        }
      }
      return state;
    }

    const code = typeof body?.code === 'string' ? body.code : `HTTP_${response.status}`;
    const message = typeof body?.error === 'string' ? body.error : 'Session verification failed';
    if (isRefresh && state.status === 'mythos' && !code.startsWith('SESSION_')) return retryRefresh();
    setState({
      status: code === 'SESSION_EXPIRED' || (isRefresh && code.startsWith('SESSION_')) ? 'expired' : 'error',
      session: null,
      error: { code, message },
    });
    return state;
  };

  const onVisibilityChange = (): void => {
    if (!document.hidden && state.status === 'mythos' && refreshAt !== null && Date.now() >= refreshAt) void load('', true);
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  const ready = load(window.location.search);

  const mythosFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const inputHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init.headers ?? inputHeaders);
    if (transport === 'header' && memoryToken && isSameOrigin(input)) {
      headers.set(MYTHOS_SESSION_HEADER, memoryToken);
    }
    const response = await window.fetch(input, {
      ...init,
      headers,
      credentials: init.credentials ?? (input instanceof Request ? input.credentials : 'same-origin'),
    });
    if (response.status === 401) {
      const body = await readJson(response.clone());
      if (typeof body?.code === 'string' && body.code.startsWith('SESSION_')) {
        setState({
          status: 'expired',
          session: null,
          error: {
            code: body.code,
            message: typeof body.error === 'string' ? body.error : 'Mythos session expired',
          },
        });
      }
    }
    return response;
  };

  const confirmCharge = (charge: ConfirmChargeOptions): Promise<ConfirmChargeResult> =>
    requestChargeConfirmation(
      charge.kind === 'llm' ? 0 : charge.credits, // ponytail: dashboard requires a numeric field; its LLM dialog ignores it
      charge.reason,
      options.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS,
      charge.kind ?? 'generic',
      options.expectedOrigin,
    );

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    get state() {
      return state;
    },
    ready,
    fetch: mythosFetch,
    confirmCharge,
    relaunch,
    subscribe,
  };
}
