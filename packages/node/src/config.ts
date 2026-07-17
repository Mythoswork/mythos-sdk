import type { MythosConfig } from './types';

const DEFAULT_API_URL = 'https://api.mythos.work';

export function loadConfig(): MythosConfig {
  const apiUrl = process.env.MYTHOS_API_URL ?? DEFAULT_API_URL;
  const multi = process.env.MYTHOS_LISTING_IDS;
  const single = process.env.MYTHOS_LISTING_ID;

  const listingIds = multi
    ? multi.split(',').map((id) => id.trim()).filter(Boolean)
    : single
      ? [single]
      : [];

  return { listingIds, apiUrl };
}
