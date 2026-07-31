// Shared spec helpers: message lookup re-export + a console/network guard that enforces the Prompt-13
// §17 assertions on any page it is attached to.
import { expect, type Page, type Request } from '@playwright/test'
import { SERVICE_ROLE_KEY, looksLikeProdSupabase, hostOf } from './_env'
export { t } from './messages'

export interface PageGuard {
  consoleErrors: string[]
  pageErrors: string[]
  requests: Request[]
  failedResponses: { url: string; status: number }[]
  /** Assert nothing forbidden happened. Call after the interactions under test. */
  assertClean(opts?: { allowConsole?: RegExp[] }): void
}

// Known-benign console noise from the dev server / third parties that is not an app defect.
const BENIGN_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /webpack\.cache/i,
  /source ?map/i,
  /Autocomplete/i, // Chrome DevTools autofill hint
  // A generic "resource 404" is browser-level noise (favicon / PWA precache / optional asset). The
  // meaningful network failures — 401/403 on REST/API and any 5xx — are asserted from failedResponses.
  /Failed to load resource: the server responded with a status of 404/i,
]

export function attachGuard(page: Page): PageGuard {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const requests: Request[] = []
  const failedResponses: { url: string; status: number }[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`))
  page.on('request', (req) => requests.push(req))
  page.on('response', (res) => {
    const s = res.status()
    if (s >= 400) failedResponses.push({ url: res.url(), status: s })
  })

  return {
    consoleErrors,
    pageErrors,
    requests,
    failedResponses,
    assertClean({ allowConsole = [] }: { allowConsole?: RegExp[] } = {}) {
      // 1) No uncaught exceptions / hydration errors.
      expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
      const hydration = consoleErrors.filter((e) => /hydrat|did not match|Text content does not match/i.test(e))
      expect(hydration, `hydration errors:\n${hydration.join('\n')}`).toEqual([])
      // 2) Remaining console errors, minus known-benign + per-test allowances.
      const filters = [...BENIGN_CONSOLE, ...allowConsole]
      const bad = consoleErrors.filter((e) => !filters.some((re) => re.test(e)))
      expect(bad, `unexpected console errors:\n${bad.join('\n')}`).toEqual([])
      // 2b) No auth failures on valid flows and no server errors (asset 404s are tolerated as noise).
      const authFails = failedResponses.filter((r) => (r.status === 401 || r.status === 403) && /\/(rest|auth|api)\//.test(r.url))
      expect(authFails, `unexpected 401/403:\n${JSON.stringify(authFails, null, 2)}`).toEqual([])
      const serverErrors = failedResponses.filter((r) => r.status >= 500)
      expect(serverErrors, `server errors:\n${JSON.stringify(serverErrors, null, 2)}`).toEqual([])
      // 3) No request ever went to a production Supabase / chococfko host.
      const prod = requests.filter((r) => looksLikeProdSupabase(r.url()))
      expect(prod.map((r) => r.url()), 'requests to a PRODUCTION host').toEqual([])
      // 4) The service-role key must never appear in a browser request (url, headers or body).
      for (const r of requests) {
        const url = r.url()
        expect(url.includes(SERVICE_ROLE_KEY), `service-role key leaked in URL: ${url}`).toBe(false)
        const headerBlob = JSON.stringify(r.headers())
        expect(headerBlob.includes(SERVICE_ROLE_KEY), `service-role key leaked in headers of ${url}`).toBe(false)
        const body = r.postData() || ''
        expect(body.includes(SERVICE_ROLE_KEY), `service-role key leaked in body of ${url}`).toBe(false)
      }
    },
  }
}

// Assert no request from this page hit the tournament audit-log table (public pages must never read it).
export function assertNoAuditLogRequests(guard: PageGuard): void {
  const audit = guard.requests.filter((r) => /tournament_audit_log/i.test(r.url()))
  expect(audit.map((r) => r.url()), 'public page must not touch tournament_audit_log').toEqual([])
}

// The hard security invariants for any page in the scoped-management flow, WITHOUT coupling to console
// noise: no uncaught/hydration error, no 5xx on a real flow, no prod host, no service-role leak, and
// the browser never touches the membership table directly. Use this in functional tests; use the
// stricter assertClean() only in the dedicated console/network test.
export function assertSecure(guard: PageGuard): void {
  expect(guard.pageErrors, `uncaught page errors:\n${guard.pageErrors.join('\n')}`).toEqual([])
  const hydration = guard.consoleErrors.filter((e) => /hydrat|did not match|Text content does not match/i.test(e))
  expect(hydration, `hydration errors:\n${hydration.join('\n')}`).toEqual([])
  const serverErrors = guard.failedResponses.filter((r) => r.status >= 500)
  expect(serverErrors, `server errors:\n${JSON.stringify(serverErrors, null, 2)}`).toEqual([])
  const prod = guard.requests.filter((r) => looksLikeProdSupabase(r.url()))
  expect(prod.map((r) => r.url()), 'requests to a PRODUCTION host').toEqual([])
  for (const r of guard.requests) {
    expect(r.url().includes(SERVICE_ROLE_KEY), `service-role key leaked in URL: ${r.url()}`).toBe(false)
    expect(JSON.stringify(r.headers()).includes(SERVICE_ROLE_KEY), `service-role key leaked in headers of ${r.url()}`).toBe(false)
    expect((r.postData() || '').includes(SERVICE_ROLE_KEY), `service-role key leaked in body of ${r.url()}`).toBe(false)
  }
  assertNoMembersTableRequests(guard)
}

// The browser must NEVER query the membership table directly — all membership reads happen server-side
// (RSC / service-role). A tournament_members request from the page would mean a client leak (§15).
export function assertNoMembersTableRequests(guard: PageGuard): void {
  const hits = guard.requests.filter((r) => /\/rest\/v1\/tournament_members/i.test(r.url()))
  expect(hits.map((r) => r.url()), 'browser must not query tournament_members directly').toEqual([])
}

// Every Supabase request from a page should target the local stack host only.
export function assertOnlyLocalSupabase(guard: PageGuard): void {
  const supa = guard.requests.filter((r) => /\/(rest|auth|realtime)\/v1\//.test(r.url()))
  for (const r of supa) {
    const h = hostOf(r.url())
    expect(['localhost', '127.0.0.1'].includes(h), `unexpected supabase host ${h} for ${r.url()}`).toBe(true)
  }
}
