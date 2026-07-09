export interface MythosSession {
  userId: string;
  email: string;
  displayName: string;
  listingId: string;
  sessionJti: string;
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
