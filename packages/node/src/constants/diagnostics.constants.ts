export const DIAGNOSTIC_MESSAGES = {
  CONFIG_ERROR: "The app's Mythos SDK is misconfigured. Check MYTHOS_SESSION_SECRET and MYTHOS_KEY.",
  PRODUCER_MISMATCH: 'MYTHOS_KEY belongs to a different Mythos account or was regenerated.',
  INVALID_LAUNCH_TOKEN: 'The app rejected the launch token. Check MYTHOS_API_URL points at this Mythos environment.',
  LISTING_NOT_REGISTERED: "This listing isn't registered with the app yet. Save the listing again or set MYTHOS_LISTING_ID.",
  TOKEN_ALREADY_CONSUMED: 'The launch token was used twice. Reload to start a new test launch.',
  SESSION_EXPIRED: 'The test session expired. Start a new test launch.',
  MYTHOS_UNREACHABLE: "The app couldn't reach Mythos. Check its network access and MYTHOS_API_URL.",
  UPSTREAM_ERROR: 'Mythos returned an unexpected error. Try again.',
  SESSION_REQUIRED: 'The app called charge() or llm() without a Mythos session.',
  INSUFFICIENT_FUNDS: "Charge failed for funds. This shouldn't happen in a test launch; report it.",
} as const;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_MESSAGES;
export const DIAGNOSTIC_STEPS = ['verify_launch', 'consume', 'session', 'meter', 'llm'] as const;
export type DiagnosticStep = typeof DIAGNOSTIC_STEPS[number];
export const DIAGNOSTIC_TIMEOUT_MS = 2_000;

export function isDiagnosticCode(code: string): code is DiagnosticCode {
  return Object.prototype.hasOwnProperty.call(DIAGNOSTIC_MESSAGES, code);
}
