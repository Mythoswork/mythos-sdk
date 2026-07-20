/**
 * Client-side Mythos session handling for TypeScript/React/Next.js frontends.
 * Copy to lib/mythosClient.ts and call initMythosFromUrl() on app load.
 *
 * Expects GET /api/mythos/session to return { session: MythosClientSession }.
 * Expects POST /api/mythos/report-usage with { sessionJti, credits, reason }.
 */

export interface MythosClientSession {
  userId: string;
  email: string;
  displayName: string;
  listingId: string;
  sessionJti: string;
}

export interface ReportUsageOptions {
  requireConfirmation?: boolean;
  confirmTimeoutMs?: number;
}

interface ConfirmChargeRequestMessage {
  type: "mythos:confirm-charge";
  requestId: string;
  credits: number;
  reason?: string;
}

interface ConfirmChargeResponseMessage {
  type: "mythos:confirm-charge-response";
  requestId: string;
  approved: boolean;
}

interface ConfirmChargeTimeoutMessage {
  type: "mythos:confirm-charge-timeout";
  requestId: string;
}

let session: MythosClientSession | null = null;
let initPromise: Promise<void> | null = null;

const CONFIRM_REQUEST_TYPE: ConfirmChargeRequestMessage["type"] = "mythos:confirm-charge";
const CONFIRM_RESPONSE_TYPE: ConfirmChargeResponseMessage["type"] = "mythos:confirm-charge-response";
const CONFIRM_TIMEOUT_TYPE: ConfirmChargeTimeoutMessage["type"] = "mythos:confirm-charge-timeout";
const DEFAULT_CONFIRM_TIMEOUT_MS = 10_000;

export function getMythosSession(): MythosClientSession | null {
  return session;
}

export function initMythosFromUrl(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const params = new URLSearchParams(window.location.search);
    const lt = params.get("lt");
    if (!lt) return;

    try {
      const res = await fetch(`/api/mythos/session?lt=${encodeURIComponent(lt)}`);
      if (res.ok) {
        const data = (await res.json()) as { session?: MythosClientSession } & MythosClientSession;
        // Support wrapped { session } or flat response (Python FastAPI style)
        session = data.session ?? data;
      }
    } catch {
      // Not launched from Mythos — fall back to normal auth flow.
    } finally {
      params.delete("lt");
      const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", clean);
    }
  })();

  return initPromise;
}

// Posts a confirm-charge request to the dashboard parent frame and waits
// for a matching response. Resolves false (never rejects) on timeout, on
// explicit decline, or if the page isn't embedded — all fail-closed.
function confirmCharge(
  credits: number,
  reason: string | undefined,
  timeoutMs: number = DEFAULT_CONFIRM_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (window === window.parent) {
      console.warn(
        "[MythosClient] requireConfirmation set but page is not embedded in a Mythos dashboard frame — skipping charge.",
      );
      resolve(false);
      return;
    }

    const requestId =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      console.warn("[MythosClient] confirm-charge timed out — skipping charge.");
      const timeoutMessage: ConfirmChargeTimeoutMessage = { type: CONFIRM_TIMEOUT_TYPE, requestId };
      window.parent.postMessage(timeoutMessage, "*");
      cleanup();
      resolve(false);
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      const data = event.data as Partial<ConfirmChargeResponseMessage> | null;
      if (!data || data.type !== CONFIRM_RESPONSE_TYPE) return;
      if (typeof data.requestId !== "string" || data.requestId !== requestId) return;
      cleanup();
      resolve(Boolean(data.approved));
    }

    function cleanup() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    const message: ConfirmChargeRequestMessage = {
      type: CONFIRM_REQUEST_TYPE,
      requestId,
      credits,
      reason,
    };
    window.parent.postMessage(message, "*");
  });
}

export async function reportMythosUsage(
  credits: number,
  reason?: string,
  opts?: ReportUsageOptions,
): Promise<void> {
  if (!session) return;

  if (opts?.requireConfirmation) {
    const approved = await confirmCharge(credits, reason, opts.confirmTimeoutMs);
    if (!approved) return;
  }

  try {
    await fetch("/api/mythos/report-usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionJti: session.sessionJti, credits, reason }),
    });
  } catch {
    // Non-fatal — never block the user's flow because billing failed.
  }
}
