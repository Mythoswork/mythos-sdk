import { useSyncExternalStore } from 'react';

import {
  initMythos,
  type InitMythosOptions,
  type MythosClient,
  type MythosClientState,
} from './mythos-client';

const SERVER_STATE: MythosClientState = { status: 'loading', session: null, error: null };
const noopSubscribe = (): (() => void) => () => {};

export type UseMythosResult = MythosClientState &
  Pick<MythosClient, 'fetch' | 'confirmCharge' | 'relaunch'>;

/** Reads the shared Mythos browser client. Only the first call's options take effect. */
export function useMythos(options?: InitMythosOptions): UseMythosResult {
  const client = typeof window === 'undefined' ? null : initMythos(options);
  const state = useSyncExternalStore(
    client ? client.subscribe : noopSubscribe,
    client ? () => client.state : () => SERVER_STATE,
    () => SERVER_STATE,
  );

  if (!client) {
    const unavailable = (): never => {
      throw new Error('[mythos] useMythos actions are browser-only');
    };
    return { ...state, fetch: unavailable, confirmCharge: unavailable, relaunch: unavailable };
  }

  return {
    ...state,
    fetch: client.fetch,
    confirmCharge: client.confirmCharge,
    relaunch: client.relaunch,
  };
}

export type { InitMythosOptions, MythosClientState, MythosStatus } from './mythos-client';
