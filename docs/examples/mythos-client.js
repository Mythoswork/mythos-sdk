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

  async function reportUsage(credits, reason) {
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

  function getSession() {
    return session;
  }

  return { init, reportUsage, getSession };
})();
