export interface MythosSession {
  userId: string;
  email: string;
  displayName: string;
  listingId: string;
  sessionJti: string;
  llmIdentityToken?: string;
  llmIdentityExpiresAt?: string;
  creditsPerUsd?: number;
}

export interface MythosConfig {
  listingIds: string[];
  apiUrl: string;
  resolveListingIds?: () => Promise<string[]>;
}

declare global {
  namespace Express {
    interface Request {
      mythos?: MythosSession;
    }
  }
}
