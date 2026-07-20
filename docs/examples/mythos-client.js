/**
 * Client-side Mythos session handling for vanilla JS frontends.
 * Load before your main script and call MythosClient.init() on page load.
 *
 * Adjust fetch URLs if your API uses different paths (e.g. /api/mythos-session).
 */
window.MythosClient = (function () {
  let session = null;
  let initPromise = null;

  function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const params = new URLSearchParams(window.location.search);
      const lt = params.get("lt");
      if (!lt) return;

      try {
        const res = await fetch(`/api/mythos/session?lt=${encodeURIComponent(lt)}`);
        if (res.ok) {
          const data = await res.json();
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

  const CONFIRM_REQUEST_TYPE = "mythos:confirm-charge";
  const CONFIRM_RESPONSE_TYPE = "mythos:confirm-charge-response";
  const CONFIRM_TIMEOUT_TYPE = "mythos:confirm-charge-timeout";
  const DEFAULT_CONFIRM_TIMEOUT_MS = 10000;

  // Posts a confirm-charge request to the dashboard parent frame and waits
  // for a matching response. Resolves false (never rejects) on timeout, on
  // explicit decline, or if the page isn't embedded — all fail-closed.
  function confirmCharge(credits, reason, timeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS) {
    return new Promise((resolve) => {
      if (window === window.parent) {
        console.warn(
          "[MythosClient] requireConfirmation set but page is not embedded in a Mythos dashboard frame — skipping charge.",
        );
        resolve(false);
        return;
      }

      const requestId =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        console.warn("[MythosClient] confirm-charge timed out — skipping charge.");
        window.parent.postMessage({ type: CONFIRM_TIMEOUT_TYPE, requestId }, "*");
        cleanup();
        resolve(false);
      }, timeoutMs);

      function onMessage(event) {
        if (event.source !== window.parent) return;
        const data = event.data;
        if (!data || data.type !== CONFIRM_RESPONSE_TYPE) return;
        if (typeof data.requestId !== "string" || data.requestId !== requestId) return;
        cleanup();
        resolve(Boolean(data.approved));
      }

      function cleanup() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
      }

      window.addEventListener("message", onMessage);
      window.parent.postMessage(
        { type: CONFIRM_REQUEST_TYPE, requestId, credits, reason },
        "*",
      );
    });
  }

  async function reportUsage(credits, reason, opts) {
    if (!session) return;
    const options = opts || {};

    if (options.requireConfirmation) {
      const approved = await confirmCharge(credits, reason, options.confirmTimeoutMs);
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

  function getSession() {
    return session;
  }

  return { init, reportUsage, getSession };
})();
