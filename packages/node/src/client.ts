// Browser-only entry point. Import this from '@mythos-work/sdk/client', never from the
// package root -- it shares no code with index.ts (which is Node-only: jose, env vars,
// authenticated fetches to the Mythos backend) so bundling one never pulls in the other.
//
// This is the Producer-side half of the postMessage protocol the Mythos dashboard's
// iframe parent speaks (see mythos-frontend's run-frame.tsx). The message-type strings are
// exported so both sides share one source of truth instead of independently hardcoding
// the same literals and risking drift.

export const MYTHOS_HANDSHAKE_MESSAGE_TYPE = 'mythos:handshake' as const;
export const MYTHOS_CONFIRM_CHARGE_REQUEST_TYPE = 'mythos:confirm-charge' as const;
export const MYTHOS_CONFIRM_CHARGE_RESPONSE_TYPE = 'mythos:confirm-charge-response' as const;
export const MYTHOS_CONFIRM_CHARGE_TIMEOUT_TYPE = 'mythos:confirm-charge-timeout' as const;

const DEFAULT_CONFIRM_TIMEOUT_MS = 10_000;

// 'generic' shows a projected credit amount up front (the caller knows the exact cost).
// 'llm' skips that projection and warns the cost is usage-based instead, since the real
// cost is only known after the provider responds.
export type MythosChargeKind = 'generic' | 'llm';

interface ConfirmChargeResponseMessage {
  type: typeof MYTHOS_CONFIRM_CHARGE_RESPONSE_TYPE;
  requestId: string;
  approved: boolean;
}

/**
 * Tells the Mythos dashboard parent frame this app has finished its own session
 * verification and is ready to be shown -- call this once, right after your app confirms
 * its Mythos session (e.g. after a successful /api/verify-session response). A no-op
 * (with a console warning) if this page isn't actually embedded in an iframe.
 */
export function sendHandshake(): void {
  if (window === window.parent) {
    console.warn('[mythos-client] not embedded in a parent frame — skipping handshake.');
    return;
  }
  window.parent.postMessage({ type: MYTHOS_HANDSHAKE_MESSAGE_TYPE }, '*');
}

/**
 * Asks the Mythos dashboard parent frame to confirm a Credit charge with the Consumer
 * before your app performs the billable action. Resolves false (never rejects) on
 * timeout, decline, or if this page isn't embedded at all -- fail-closed, so a missing or
 * unresponsive dashboard never silently lets a charge through.
 */
export function confirmCharge(
  credits: number,
  reason?: string,
  timeoutMs: number = DEFAULT_CONFIRM_TIMEOUT_MS,
  kind: MythosChargeKind = 'generic',
): Promise<boolean> {
  return new Promise((resolve) => {
    if (window === window.parent) {
      console.warn('[mythos-client] not embedded in a parent frame — skipping charge.');
      resolve(false);
      return;
    }

    const requestId =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      console.warn('[mythos-client] timed out waiting for a confirm-charge response — skipping charge.');
      window.parent.postMessage({ type: MYTHOS_CONFIRM_CHARGE_TIMEOUT_TYPE, requestId }, '*');
      cleanup();
      resolve(false);
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      const data = event.data as Partial<ConfirmChargeResponseMessage> | null;
      if (!data || data.type !== MYTHOS_CONFIRM_CHARGE_RESPONSE_TYPE) return;
      if (typeof data.requestId !== 'string' || data.requestId !== requestId) return;
      cleanup();
      resolve(Boolean(data.approved));
    }

    function cleanup() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    }

    window.addEventListener('message', onMessage);
    window.parent.postMessage(
      { type: MYTHOS_CONFIRM_CHARGE_REQUEST_TYPE, requestId, credits, reason, kind },
      '*',
    );
  });
}
