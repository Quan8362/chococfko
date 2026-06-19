// Public/Community vs FKO-internal access — PURE helpers + types.
// NO server-only imports here, so this is safe to import from client components
// (e.g. the scope selector). Server-side membership lookups live in
// `@/lib/access-server`.

export type Scope = 'community' | 'fko_internal'

export const SCOPES: readonly Scope[] = ['community', 'fko_internal'] as const
export const DEFAULT_SCOPE: Scope = 'community'

export function isScope(v: unknown): v is Scope {
  return v === 'community' || v === 'fko_internal'
}

// Effective access of the current viewer.
export interface UserAccess {
  userId: string | null
  isInternal: boolean // active internal_members row
  isAdmin: boolean    // ADMIN_EMAILS
}

export const ANON_ACCESS: UserAccess = { userId: null, isInternal: false, isAdmin: false }

// Admins implicitly get internal access (so they can moderate internal content).
export function canAccessScope(access: UserAccess, scope: Scope): boolean {
  if (scope === 'community') return true
  return access.isInternal || access.isAdmin
}

// Parse an untrusted scope value coming from the client (query param / form).
// Anything other than the exact internal token resolves to community.
export function parseScopeParam(raw: string | undefined | null): Scope {
  return raw === 'fko_internal' ? 'fko_internal' : 'community'
}

// Resolve a requested scope for READING a list. If the viewer may not access
// the requested scope, downgrade to community instead of leaking internal data.
export function validateRequestedScope(raw: string | undefined | null, access: UserAccess): Scope {
  const requested = parseScopeParam(raw)
  return canAccessScope(access, requested) ? requested : DEFAULT_SCOPE
}

// Resolve the scope to WRITE new content with. A viewer who may not post to the
// requested scope is forced down to community (never silently escalated).
export function resolvePostScope(raw: string | undefined | null, access: UserAccess): Scope {
  const requested = parseScopeParam(raw)
  return canAccessScope(access, requested) ? requested : DEFAULT_SCOPE
}
