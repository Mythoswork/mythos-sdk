const PREFIX = '[mythos]';
const isDebug = (): boolean => process.env.MYTHOS_DEBUG === '1';

export const mythosLog = {
  error: (msg: string, detail?: unknown): void => {
    if (detail === undefined) console.error(PREFIX, msg);
    else console.error(PREFIX, msg, detail);
  },
  warn: (msg: string, detail?: unknown): void => {
    if (detail === undefined) console.warn(PREFIX, msg);
    else console.warn(PREFIX, msg, detail);
  },
  debug: (msg: string, detail?: unknown): void => {
    if (!isDebug()) return;
    if (detail === undefined) console.debug(PREFIX, msg);
    else console.debug(PREFIX, msg, detail);
  },
};
