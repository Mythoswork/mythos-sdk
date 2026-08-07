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
  const {type, children, className, id} = props;
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
        The title is dropped entirely. Docusaurus's Admonition/Type/*
        components always pass one — defaulting to the type name — so there is
        no way to tell an authored title from "info" at this layer. The Figma
        has no label bar, and no page in docs/ authors a custom title, so
        rendering none is both correct for the mock and lossless today. If a
        custom title is ever needed, swizzle Admonition/Type/* to pass a flag.
      */}
      <div className="mythos-admonition__body">{children}</div>
    </div>
  );
}
