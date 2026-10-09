import { DIAGNOSTIC_MESSAGES } from './constants/diagnostics.constants';
import { TEST_FAILURE_CODES, TEST_FAILURE_OVERLAY_ID, TEST_FAILURE_OVERLAY_STYLE, TEST_FAILURE_TITLE, type TestFailureCode } from './constants/test-failure.constants';

export function isTestLaunch(search: string): boolean {
  try {
    const token = new URLSearchParams(search).get('lt');
    if (!token) return false;
    const segment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, '=')));
    return typeof payload === 'object' && payload !== null && 'test' in payload && payload.test === true;
  } catch {
    return false;
  }
}

function isTestFailureCode(code: string): code is TestFailureCode {
  return TEST_FAILURE_CODES.some((value) => value === code);
}

export function renderTestFailureOverlay(code: TestFailureCode): void {
  if (document.getElementById(TEST_FAILURE_OVERLAY_ID)) return;
  const overlay = document.createElement('div');
  overlay.id = TEST_FAILURE_OVERLAY_ID;
  overlay.style.cssText = TEST_FAILURE_OVERLAY_STYLE;
  const title = document.createElement('h1');
  title.textContent = TEST_FAILURE_TITLE;
  const body = document.createElement('p');
  body.textContent = DIAGNOSTIC_MESSAGES[code];
  const label = document.createElement('code');
  label.textContent = code;
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => window.location.reload());
  overlay.append(title, body, label, reload);
  document.body.append(overlay);
}

export function showTestLaunchFailure(search: string, code: string): void {
  if (!isTestLaunch(search) || !isTestFailureCode(code)) return;
  try {
    renderTestFailureOverlay(code);
  } catch {
    // Diagnostic UI is best-effort and cannot alter the app's session response.
  }
}
