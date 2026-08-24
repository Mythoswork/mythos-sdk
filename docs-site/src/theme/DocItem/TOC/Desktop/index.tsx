import React, {type ReactNode} from 'react';
import {ThemeClassNames} from '@docusaurus/theme-common';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import Translate from '@docusaurus/Translate';

import TOC from '@theme/TOC';

/**
 * Adds the "ON THIS PAGE" eyebrow the Figma puts above the desktop TOC.
 * Docusaurus ships the list unlabelled, which leaves the column reading as
 * loose links rather than a titled region.
 */
export default function DocItemTOCDesktop(): ReactNode {
  const {toc, frontMatter} = useDoc();
  return (
    <nav aria-labelledby="mythos-toc-heading">
      <div className="mythos-toc-heading" id="mythos-toc-heading">
        <Translate
          id="theme.TOCHeading"
          description="The heading above the desktop table of contents">
          On this page
        </Translate>
      </div>
      <TOC
        toc={toc}
        minHeadingLevel={frontMatter.toc_min_heading_level}
        maxHeadingLevel={frontMatter.toc_max_heading_level}
        className={ThemeClassNames.docs.docTocDesktop}
      />
    </nav>
  );
}
