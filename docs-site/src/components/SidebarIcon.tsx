import React, { type ReactNode } from 'react';
import { Rocket, BookOpen, Compass, Braces, Box } from 'lucide-react';

/**
 * Maps the `customProps.icon` string set per category in sidebars.js to a
 * lucide glyph. Kept as an explicit allow-list rather than a dynamic lookup so
 * the bundle only carries the five icons the sidebar actually uses.
 */
const ICONS = {
  rocket: Rocket,
  book: BookOpen,
  compass: Compass,
  braces: Braces,
  box: Box,
} as const;

export type SidebarIconName = keyof typeof ICONS;

export default function SidebarIcon({
  name,
}: {
  name?: string | undefined;
}): ReactNode {
  if (!name || !(name in ICONS)) {
    return null;
  }
  const Glyph = ICONS[name as SidebarIconName];
  return <Glyph size={14} strokeWidth={1.75} aria-hidden />;
}
