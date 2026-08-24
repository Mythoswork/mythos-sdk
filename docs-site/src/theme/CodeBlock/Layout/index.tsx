import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {useCodeBlockContext} from '@docusaurus/theme-common/internal';
import Container from '@theme/CodeBlock/Container';
import Title from '@theme/CodeBlock/Title';
import Content from '@theme/CodeBlock/Content';
import type {Props} from '@theme/CodeBlock/Layout';
import Buttons from '@theme/CodeBlock/Buttons';
import {Badge} from '@site/src/components/ui/badge';

import styles from './styles.module.css';

/**
 * Human-readable names for the language slugs that appear in our fences.
 * Anything unlisted falls through to the raw slug.
 */
const LANGUAGE_LABELS: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  console: 'bash',
  yml: 'yaml',
};

function useLanguageLabel(): string | null {
  const {metadata} = useCodeBlockContext();
  // metadata.className carries Prism's `language-xxx` marker.
  const match = /language-([\w-]+)/.exec(metadata.className ?? '');
  if (!match) {
    return null;
  }
  const raw = match[1]!.toLowerCase();
  return LANGUAGE_LABELS[raw] ?? raw;
}

/**
 * The Figma gives every code block a persistent header: language on the left,
 * Copy on the right, separated from the code by a rule. Docusaurus's default
 * floats the buttons over the code and only reveals them on hover, and never
 * shows the language at all.
 */
export default function CodeBlockLayout({className}: Props): ReactNode {
  const {metadata} = useCodeBlockContext();
  const language = useLanguageLabel();

  return (
    <Container as="div" className={clsx(className, metadata.className, 'mythos-code')}>
      <div className="mythos-code__header">
        {metadata.title ? (
          <span className="mythos-code__lang">
            <Title>{metadata.title}</Title>
          </span>
        ) : (
          language && (
            <Badge variant="secondary" className="mythos-code__lang">
              {language}
            </Badge>
          )
        )}
        <Buttons />
      </div>
      <div className={styles.codeBlockContent}>
        <Content />
      </div>
    </Container>
  );
}
