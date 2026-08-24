import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link2, Check } from 'lucide-react';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import LastUpdated from '@theme/LastUpdated';

/**
 * The "Last updated · Copy link" row the Figma places directly under the page
 * title. Docusaurus surfaces last-updated metadata only in the footer, so it
 * is re-rendered here and the footer copy is hidden in CSS.
 *
 * Date formatting is delegated to @theme/LastUpdated rather than reimplemented
 * — it owns the epoch-unit semantics and the locale-aware format, and a second
 * copy of that logic is exactly how the date ends up disagreeing with itself.
 */
export default function DocMetaRow(): ReactNode {
  const { metadata } = useDoc();
  const [copied, setCopied] = useState(false);
  // Mirrors the CopyButton pattern: a ref holds the reset timeout so it can be
  // cleared on unmount, preventing a stale-closure fire after navigation.
  const copyTimeout = useRef<number | undefined>(undefined);

  const copyLink = useCallback(() => {
    // Bail rather than throw on non-secure origins, where clipboard is absent.
    if (typeof window === 'undefined' || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      copyTimeout.current = window.setTimeout(() => setCopied(false), 2000);
    });
    // Errors are intentionally not caught so they remain unhandled and can be
    // captured by observability tools (e.g. Sentry, PostHog) — same approach
    // as CopyButton in theme/CodeBlock/Buttons/CopyButton.
  }, []);

  useEffect(() => () => window.clearTimeout(copyTimeout.current), []);

  const { lastUpdatedAt, lastUpdatedBy } = metadata;

  if (!lastUpdatedAt && !lastUpdatedBy) {
    return null;
  }

  return (
    <div className="mythos-doc-meta">
      <LastUpdated lastUpdatedAt={lastUpdatedAt} lastUpdatedBy={lastUpdatedBy} />
      <button
        type="button"
        className="mythos-doc-meta__copy"
        onClick={copyLink}
        aria-label="Copy link to this page">
        {copied ? <Check size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
