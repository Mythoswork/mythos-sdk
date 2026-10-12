export const TEST_FAILURE_CODES = [
  'CONFIG_ERROR', 'PRODUCER_MISMATCH', 'INVALID_LAUNCH_TOKEN',
  'LISTING_NOT_REGISTERED', 'MYTHOS_UNREACHABLE', 'UPSTREAM_ERROR',
] as const;
export type TestFailureCode = typeof TEST_FAILURE_CODES[number];
export const TEST_FAILURE_TITLE = 'Mythos test launch failed';
export const TEST_FAILURE_OVERLAY_ID = 'mythos-test-failure';
export const TEST_FAILURE_OVERLAY_STYLE = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#fff;color:#171717;font-family:system-ui,sans-serif;text-align:center;';
