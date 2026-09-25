import {
  MYTHOS_RELAUNCH_MESSAGE_TYPE,
  requestChargeConfirmation,
  sendHandshake,
  type ConfirmChargeResult,
  type MythosChargeKind,
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
}

export interface MythosClient {
  readonly state: MythosClientState;
  readonly ready: Promise<MythosClientState>;
  subscribe(listener: () => void): () => void;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  confirmCharge(options: {
    credits: number;
    reason?: string;
    kind?: MythosChargeKind;
  }): Promise<ConfirmChargeResult>;
  relaunch(): void;
}

interface SessionResponseBody {
  success?: boolean;
  data?: { session?: MythosClientSession; sessionToken?: string } | null;
  code?: string;
  error?: string;
}

export const MYTHOS_SESSION_HEADER = 'X-Mythos-Session';
const TRANSPORT_KEY = 'mythos:transport';
const TOKEN_KEY = 'mythos:session-token';
const DEFAULT_SESSION_PATH = '/api/mythos/session';
const DEFAULT_CONFIRM_TIMEOUT_MS = 10_000;

let instance: MythosClient | null = null;

export function initMythos(options: InitMythosOptions = {}): MythosClient {
  if (instance) return instance;
  instance = createClient(options);
  return instance;
}

/** Test-only: drop the singleton so each test starts clean. */
export function resetMythosClientForTests(): void {
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

  const setState = (next: MythosClientState): void => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const load = async (): Promise<MythosClientState> => {
    const sessionUrl = `${sessionPath}${window.location.search}`;
    const headers = new Headers();
    if (memoryToken && isSameOrigin(sessionUrl)) headers.set(MYTHOS_SESSION_HEADER, memoryToken);
    let response: Response;

    try {
      response = await window.fetch(sessionUrl, {
        credentials: 'same-origin',
        headers,
      });
    } catch (error) {
      setState({
        status: 'error',
        session: null,
        error: { code: 'NETWORK_ERROR', message: String(error) },
      });
      return state;
    }

    const body = await readJson(response);
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
      try {
        sendHandshake(options.expectedOrigin);
      } catch {
        // Session state remains usable when the embedding frame rejects postMessage.
      }
      return state;
    }

    const code = typeof body?.code === 'string' ? body.code : `HTTP_${response.status}`;
    const message = typeof body?.error === 'string' ? body.error : 'Session verification failed';
    setState({
      status: code === 'SESSION_EXPIRED' ? 'expired' : 'error',
      session: null,
      error: { code, message },
    });
    return state;
  };

  const ready = load();

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

  const confirmCharge = ({ credits, reason, kind = 'generic' }: {
    credits: number;
    reason?: string;
    kind?: MythosChargeKind;
  }): Promise<ConfirmChargeResult> =>
    requestChargeConfirmation(
      credits,
      reason,
      options.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS,
      kind,
      options.expectedOrigin,
    );

  const relaunch = (): void => {
    if (!isEmbedded()) return;
    try {
      window.parent.postMessage({ type: MYTHOS_RELAUNCH_MESSAGE_TYPE }, options.expectedOrigin ?? '*');
    } catch {
      // Relaunch is best-effort when the embedding origin is unavailable.
    }
  };

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
