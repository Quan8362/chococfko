// Unguessable share tokens for read-only list/plan links. Uses crypto UUIDs
// (122 bits of randomness) so private content is never exposed via guessable IDs.

export function genShareToken(): string {
  const uuid = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return uuid.replace(/-/g, '');
}

/** Token format guard (hex-ish, length >= 24). */
export function isValidShareToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && /^[a-z0-9]{24,64}$/i.test(token);
}
