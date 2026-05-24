import { meterSession } from './api-client.js';

export async function reportUsage(
  jti: string,
  opts: { credits: number; reason?: string },
): Promise<void> {
  await meterSession(jti, opts.credits, opts.reason);
}
