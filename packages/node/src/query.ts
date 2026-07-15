export function extractLaunchToken(raw: unknown): string | undefined {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string' && first.length > 0 ? first : undefined;
}
