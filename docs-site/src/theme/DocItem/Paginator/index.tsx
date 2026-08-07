import React, {type ReactNode} from 'react';
import Link from '@docusaurus/Link';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {ArrowLeft, ArrowRight} from 'lucide-react';
import {Card} from '@site/src/components/ui/card';

type NavItem = {permalink: string; title: string} | undefined;

function PaginatorCard({
  item,
  direction,
}: {
  item: NonNullable<NavItem>;
  direction: 'previous' | 'next';
}) {
  const isNext = direction === 'next';
  return (
    <Link
      to={item.permalink}
      className={`mythos-paginator__link mythos-paginator__link--${direction}`}>
      <Card className="mythos-paginator__card">
        <span className="mythos-paginator__label">
          {isNext ? (
            <>
              Next <ArrowRight size={13} aria-hidden />
            </>
          ) : (
            <>
              <ArrowLeft size={13} aria-hidden /> Previous
            </>
          )}
        </span>
        <span className="mythos-paginator__title">{item.title}</span>
      </Card>
    </Link>
  );
}

/**
 * Rebuilt on the shadcn Card so prev/next read as surfaces, matching the
 * Figma. Docusaurus's default renders them as bordered anchors with the label
 * above the title in the opposite alignment.
 */
export default function DocItemPaginator(): ReactNode {
  const {metadata} = useDoc();
  const previous = metadata.previous as NavItem;
  const next = metadata.next as NavItem;

  if (!previous && !next) {
    return null;
  }

  return (
    <nav className="mythos-paginator" aria-label="Docs pages">
      {previous ? <PaginatorCard item={previous} direction="previous" /> : <span />}
      {next ? <PaginatorCard item={next} direction="next" /> : <span />}
    </nav>
  );
}
