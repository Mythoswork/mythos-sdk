import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {ThemeClassNames} from '@docusaurus/theme-common';
import {Info, TriangleAlert, CircleCheck, CircleAlert, Lightbulb} from 'lucide-react';

import type {Props} from '@theme/Admonition/Layout';

import styles from './styles.module.css';

/**
 * The Figma's callouts are a tinted surface with a leading icon and no title
 * bar — Infima's default stacks an uppercase label above the body and paints a
 * heavy left rule. Icons are replaced with lucide to match the rest of the
 * chrome; Docusaurus's own SVGs are a different weight and grid.
 */
const ICONS: Record<string, typeof Info> = {
  note: Info,
  info: Info,
  tip: Lightbulb,
  success: CircleCheck,
  warning: TriangleAlert,
  caution: TriangleAlert,
  danger: CircleAlert,
};

function AdmonitionIcon({type}: {type: string}) {
  const Glyph = ICONS[type] ?? Info;
  return <Glyph size={17} strokeWidth={1.9} aria-hidden />;
}

export default function AdmonitionLayout(props: Props): ReactNode {
  const {type, title, children, className, id} = props;
  return (
    <div
      className={clsx(
        ThemeClassNames.common.admonition,
        ThemeClassNames.common.admonitionType(type),
        styles.admonition,
        'mythos-admonition',
        className,
      )}
      id={id}>
      <span className="mythos-admonition__icon">
        <AdmonitionIcon type={type} />
      </span>
      {/*
        The title is rendered visually-hidden rather than dropped. The Figma
        has no visible label bar, but screen readers need the type label
        (e.g. "danger") to distinguish admonition kinds — the lucide icon is
        decorative (aria-hidden). Docusaurus's Admonition/Type/* components
        always pass a title (defaulting to the type name), and an authored
        `:::warning[Custom Title]` title reaches AT here too. If a visible
        title is ever needed, swizzle Admonition/Type/* to pass a flag.
      */}
      {title ? (
        <span className={styles.visuallyHidden}>{title}</span>
      ) : null}
      <div className="mythos-admonition__body">{children}</div>
    </div>
  );
}
