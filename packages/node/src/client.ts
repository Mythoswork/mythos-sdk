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
export const MYTHOS_RELAUNCH_MESSAGE_TYPE = 'mythos:relaunch' as const;

const DEFAULT_CONFIRM_TIMEOUT_MS = 10_000;

// 'generic' shows a projected credit amount up front (the caller knows the exact cost).
// 'llm' skips that projection and warns the cost is usage-based instead, since the real
// cost is only known after the provider responds.
export type MythosChargeKind = 'generic' | 'llm';

export interface ConfirmChargeResult {
  approved: boolean;
  consentId?: string;
}

interface ConfirmChargeResponseMessage {
  type: typeof MYTHOS_CONFIRM_CHARGE_RESPONSE_TYPE;
  requestId: string;
  approved: boolean;
  consentId?: string;
}

/**
 * Tells the Mythos dashboard parent frame this app has finished its own session
 * verification and is ready to be shown -- call this once, right after your app confirms
 * its Mythos session (initMythos/useMythos do this automatically). A no-op
 * (with a console warning) if this page isn't actually embedded in an iframe.
 *
 * `expectedOrigin` restricts the outgoing postMessage's targetOrigin instead of the
 * permissive `'*'` -- pass the Mythos dashboard's real origin when your app knows it (e.g.
 * from a build-time env var) so this app's handshake can't be read by an unexpected frame
 * if the page ends up embedded somewhere it shouldn't be. Optional and omitted by default
 * for backward compatibility; the actual security boundary is the backend wallet
 * hold/402 on any billable action, not this message exchange.
 */
export function sendHandshake(expectedOrigin?: string): void {
  if (window === window.parent) {
    console.warn('[mythos-client] not embedded in a parent frame — skipping handshake.');
    return;
  }
  window.parent.postMessage({ type: MYTHOS_HANDSHAKE_MESSAGE_TYPE }, expectedOrigin ?? '*');
}

/**
 * Asks the Mythos dashboard parent frame to confirm a Credit charge with the Consumer
 * before your app performs the billable action. Resolves `{ approved: false }` (never
 * rejects) on timeout, decline, or if this page isn't embedded at all -- fail-closed, so
 * a missing or unresponsive dashboard never silently lets a charge through.
 *
 * `expectedOrigin` restricts both the outgoing postMessage's targetOrigin and which
 * frame's response is accepted (checked against `event.origin`, in addition to the
 * existing `event.source === window.parent` check). Optional and omitted by default for
 * backward compatibility -- without it, any frame that is `window.parent` can read the
 * outgoing `credits`/`reason` and answer on its behalf. The real security boundary
 * remains the backend wallet hold/402 on the billable action itself; this only hardens the
 * confirmation UX against an unexpected embedding frame.
 */
export function requestChargeConfirmation(
  credits: number,
  reason?: string,
  timeoutMs: number = DEFAULT_CONFIRM_TIMEOUT_MS,
  kind: MythosChargeKind = 'generic',
  expectedOrigin?: string,
): Promise<ConfirmChargeResult> {
  return new Promise((resolve) => {
    if (window === window.parent) {
      console.warn('[mythos-client] not embedded in a parent frame — skipping charge.');
      resolve({ approved: false });
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
      try {
        window.parent.postMessage({ type: MYTHOS_CONFIRM_CHARGE_TIMEOUT_TYPE, requestId }, expectedOrigin ?? '*');
      } catch {
        // Confirmation already failed closed; an invalid target origin changes no result.
      }
      cleanup();
      resolve({ approved: false });
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      if (expectedOrigin !== undefined && event.origin !== expectedOrigin) return;
      const data = event.data as Partial<ConfirmChargeResponseMessage> | null;
      if (!data || data.type !== MYTHOS_CONFIRM_CHARGE_RESPONSE_TYPE) return;
      if (typeof data.requestId !== 'string' || data.requestId !== requestId) return;
      cleanup();
      resolve({
        approved: Boolean(data.approved),
        ...(typeof data.consentId === 'string' ? { consentId: data.consentId } : {}),
      });
    }

    function cleanup() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    }

    window.addEventListener('message', onMessage);
    try {
      window.parent.postMessage(
        { type: MYTHOS_CONFIRM_CHARGE_REQUEST_TYPE, requestId, credits, reason, kind },
        expectedOrigin ?? '*',
      );
    } catch {
      cleanup();
      resolve({ approved: false });
    }
  });
}

export async function confirmCharge(
  credits: number,
  reason?: string,
  timeoutMs: number = DEFAULT_CONFIRM_TIMEOUT_MS,
  kind: MythosChargeKind = 'generic',
  expectedOrigin?: string,
): Promise<boolean> {
  const { approved } = await requestChargeConfirmation(credits, reason, timeoutMs, kind, expectedOrigin);
  return approved;
}

export { initMythos } from './mythos-client';
export type { InitMythosOptions, MythosClient, MythosClientState, MythosStatus } from './mythos-client';
