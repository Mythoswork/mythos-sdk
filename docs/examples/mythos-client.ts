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

let session: MythosClientSession | null = null;
let initPromise: Promise<void> | null = null;

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

export async function reportMythosUsage(credits: number, reason?: string): Promise<void> {
  if (!session) return;
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
