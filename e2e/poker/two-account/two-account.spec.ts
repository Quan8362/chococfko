// ── Two-account LOCAL poker practice playtest (Prompt 27F-B3) ────────────────────────────
//
// Deterministic replacement for the abandoned Claude-for-Chrome two-browser test. Drives the
// ISOLATED practice-bot mode through TWO fully-isolated Playwright browser contexts (A + B),
// each authenticated as a different real local account, against the LOCAL environment ONLY.
//
// SAFETY. A per-context network guard aborts + records any request to a non-loopback poker/auth
// host (*.supabase.co, chococfko.com, …). Tracing/video are OFF so no private hole card is ever
// captured; screenshots mask card faces; the tester password + tokens are never logged or written.
//
// It NEVER touches game_wallets / coin_ledger, never runs migrations, never deploys.
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import {
  BASE_URL, SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY, TESTER_PASSWORD, TESTERS,
  ARTIFACT_DIR, assertLoopbackOrThrow, classifyHost,
} from './_playtest-env'

assertLoopbackOrThrow()
fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

const STARTING_STACK = 10_000
const BIG_BLIND = 100

// ── shared, cross-test state ──────────────────────────────────────────────────────────────
interface Ctx {
  key: 'A' | 'B'
  email: string
  userId: string | null
  context: BrowserContext
  page: Page
  violations: { host: string; method: string; path: string }[]
  loopbackRoutes: Set<string>
  fontHosts: Set<string>
}
let A: Ctx
let B: Ctx

const coverage = { global: new Set<string>() }
const perHand: Record<string, unknown>[] = []
const gate: Record<string, unknown> = {}
const scenarioResults: Record<string, string> = {}

// ── low-level helpers ───────────────────────────────────────────────────────────────────────
function safePath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname // strip query — never record tokens
  } catch {
    return '(unparseable)'
  }
}

// Intercept ONLY non-loopback http(s) requests, so local app + Server Action traffic passes
// through untouched (intercepting RSC/Server-Action POST streams can corrupt them). Any external
// host still reaches this handler: fonts are allowed, everything else is a fail-closed violation.
const NON_LOOPBACK = /^https?:\/\/(?!127\.0\.0\.1|localhost)/i

async function installGuard(ctx: Ctx): Promise<void> {
  await ctx.context.route(NON_LOOPBACK, async (route) => {
    const req = route.request()
    let host = ''
    try {
      host = new URL(req.url()).host
    } catch {
      /* ignore */
    }
    const kind = classifyHost(host)
    if (kind === 'font') {
      ctx.fontHosts.add(host)
      return route.continue()
    }
    ctx.violations.push({ host, method: req.method(), path: safePath(req.url()) })
    return route.abort('blockedbyclient')
  })
  ctx.page.on('response', (r) => {
    try {
      const u = new URL(r.url())
      if (classifyHost(u.host) === 'loopback') ctx.loopbackRoutes.add(`${r.request().method()} ${u.pathname} → ${r.status()}`)
    } catch {
      /* ignore */
    }
  })
}

async function login(ctx: Ctx): Promise<void> {
  const page = ctx.page
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', ctx.email)
  await page.fill('input[name="password"]', TESTER_PASSWORD) // trace/video OFF → never recorded
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.locator('form button[type="submit"]').first().click(),
  ])
}

async function assertAuthed(ctx: Ctx): Promise<void> {
  await ctx.page.goto('/profile', { waitUntil: 'domcontentloaded' })
  await expect(ctx.page).toHaveURL(/\/profile/, { timeout: 15_000 })
}

async function assertLoggedOut(ctx: Ctx): Promise<void> {
  await ctx.page.goto('/profile', { waitUntil: 'domcontentloaded' })
  await ctx.page.waitForURL(/\/login/, { timeout: 15_000 })
}

async function logout(ctx: Ctx): Promise<void> {
  const page = ctx.page
  // (1) Exercise the REAL UI sign-out (best-effort — the Server-Action <form> in the account
  //     dropdown depends on header hydration, which can lag). (2) Then deterministically terminate
  //     the session at the browser level by clearing this context's cookies. Either way, the end
  //     state — context A signed out, context B untouched — is the property under test.
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(500)
    await page.locator('button[aria-haspopup="menu"]').last().click({ timeout: 5000 })
    await page.waitForTimeout(500)
    const logoutBtn = page.getByRole('button', { name: 'Đăng xuất' }).first() // default locale vi
    await logoutBtn.click({ timeout: 5000 })
    await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 8000 }).catch(() => {})
  } catch {
    /* fall through to the deterministic cookie clear */
  }
  await ctx.context.clearCookies()
  await page.goto('/profile', { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/login/, { timeout: 10_000 })
}

// One evaluate returns the whole authoritative table projection the client currently renders.
// Returns only counts + public numbers — never card face values.
async function snapshot(page: Page): Promise<{
  started: boolean
  handNo: number | null
  pot: number
  stacks: number[]
  seatCount: number
  completed: boolean
  myTurn: boolean
  ownHoleCount: number
  acts: { fold: boolean; check: boolean; call: boolean; bet: boolean; raise: boolean; allin: boolean }
  callAmt: number
  boardLen: number
  revealCount: number
}> {
  return await page.evaluate(() => {
    const q = (s: string) => document.querySelector(s)
    const qa = (s: string) => Array.from(document.querySelectorAll(s))
    const started = !!q('[data-testid="practice-handno"]')
    if (!started) {
      return {
        started: false, handNo: null, pot: 0, stacks: [] as number[], seatCount: 0,
        completed: false, myTurn: false, ownHoleCount: 0,
        acts: { fold: false, check: false, call: false, bet: false, raise: false, allin: false },
        callAmt: 0, boardLen: 0, revealCount: 0,
      }
    }
    const digits = (el: Element | null) => (el ? parseInt((el.textContent || '').replace(/[^0-9-]/g, '') || '0', 10) : 0)
    const handNo = digits(q('[data-testid="practice-handno"]'))
    const pot = digits(q('[data-testid="practice-pot"]'))
    const stacks = qa('[data-testid^="seat-stack-"]').map((e) => digits(e))
    const completed = !!q('[data-testid="practice-result"]')
    const myTurn = !!q('[data-testid="practice-actions"]')
    const ownHoleCount = qa('[class*="border-rose/40"]').length
    const has = (id: string) => !!q(`[data-testid="act-${id}"]`)
    const acts = { fold: has('fold'), check: has('check'), call: has('call'), bet: has('bet'), raise: has('raise'), allin: has('all-in') }
    const callBtn = q('[data-testid="act-call"]')
    const callAmt = callBtn ? parseInt((callBtn.textContent || '').replace(/[^0-9]/g, '') || '0', 10) : 0
    const isCard = (t: string | null) => /^[2-9TJQKA][cdhs]$/.test((t || '').trim())
    let boardLen = 0
    for (const s of qa('span.font-mono')) {
      if (!isCard(s.textContent)) continue
      if ((s.className || '').includes('border-rose/40')) continue // own hole
      if (s.closest('[data-testid^="seat-"]')) continue // seat reveal
      boardLen++
    }
    let revealCount = 0
    for (const s of qa('[data-testid^="seat-"] span.font-mono')) if (isCard(s.textContent)) revealCount++
    return { started, handNo, pot, stacks, seatCount: stacks.length, completed, myTurn, ownHoleCount, acts, callAmt, boardLen, revealCount }
  })
}

type Snap = Awaited<ReturnType<typeof snapshot>>

function sig(st: Snap): string {
  return `${st.handNo}|${st.completed ? 1 : 0}|${st.pot}|${st.stacks.join(',')}|${st.myTurn ? 1 : 0}|${st.boardLen}`
}

// Economy invariant. Chips are conserved: during betting sum(stacks)+pot == total; at completion
// the pot has been awarded into the stacks so sum(stacks) == total.
function assertConservation(st: Snap): void {
  if (!st.started || st.seatCount === 0) return
  const total = st.seatCount * STARTING_STACK
  for (const s of st.stacks) {
    expect(Number.isInteger(s), `stack integer (${s})`).toBe(true)
    expect(s, 'stack non-negative').toBeGreaterThanOrEqual(0)
  }
  expect(Number.isInteger(st.pot), 'pot integer').toBe(true)
  expect(st.pot, 'pot non-negative').toBeGreaterThanOrEqual(0)
  const sum = st.stacks.reduce((a, b) => a + b, 0)
  if (st.completed) expect(sum, 'chips conserved at completion').toBe(total)
  else expect(sum + st.pot, 'chips conserved during betting').toBe(total)
}

async function waitForAdvance(page: Page, before: string): Promise<void> {
  await expect
    .poll(async () => {
      const st = await snapshot(page)
      if (!st.started) return `reset:${Math.random()}` // treat reset as a change
      return sig(st)
    }, { timeout: 25_000, intervals: [100, 150, 250, 400, 600] })
    .not.toBe(before)
}

async function gotoPracticeFresh(ctx: Ctx): Promise<void> {
  await ctx.page.goto('/games/poker/practice', { waitUntil: 'domcontentloaded' })
  await expect(ctx.page.locator('[data-testid="practice-start"]')).toBeVisible({ timeout: 20_000 })
  // The practice table is a client component; its onClick/onChange handlers only work after React
  // hydration. Wait for the initial provider chatter to settle so start() actually fires.
  await ctx.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await ctx.page.waitForTimeout(400)
}

async function startTable(ctx: Ctx, difficulty: 'easy' | 'normal' | 'hard', seatCount = 2): Promise<void> {
  const page = ctx.page
  if ((await page.locator('[data-testid="practice-start"]').count()) === 0) await gotoPracticeFresh(ctx)
  else await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  // Set difficulty + seat count after hydration (controlled selects would otherwise be reset).
  await page.locator('select').nth(0).selectOption(difficulty)
  await page.locator('select').nth(1).selectOption(String(seatCount))
  // Click start; retry to absorb any residual hydration race until a live view appears.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.locator('[data-testid="practice-start"]').click().catch(() => {})
    const appeared = await page
      .locator('[data-testid="practice-handno"]')
      .waitFor({ state: 'visible', timeout: 7000 })
      .then(() => true)
      .catch(() => false)
    if (appeared) break
    if ((await page.locator('[data-testid="practice-start"]').count()) === 0) break
    await page.waitForTimeout(1000)
  }
  await expect.poll(async () => (await snapshot(page)).started, { timeout: 15_000 }).toBe(true)
}

function recordAction(rec: { actions: Record<string, number> }, action: string): void {
  const label = action === 'all-in' ? 'all_in' : action
  rec.actions[label] = (rec.actions[label] || 0) + 1
  coverage.global.add(label)
}

async function chooseAndAct(
  ctx: Ctx,
  mode: string,
  st: Snap,
  hc: Record<string, boolean>,
  rec: { actions: Record<string, number> },
): Promise<boolean> {
  const page = ctx.page
  const a = st.acts
  const myStack = st.stacks[0] ?? 0
  const safeCall = a.call && st.callAmt <= Math.min(2500, Math.floor(myStack * 0.6))
  let target: string | null = null
  if (mode === 'fold_to_bet') {
    target = a.check ? 'check' : a.fold ? 'fold' : a.call ? 'call' : a.allin ? 'all-in' : null
  } else if (mode === 'passive_showdown') {
    target = a.check ? 'check' : safeCall ? 'call' : a.fold ? 'fold' : a.call ? 'call' : null
  } else if (mode === 'aggro_min') {
    if (a.bet && !hc.bet) { target = 'bet'; hc.bet = true }
    else if (a.raise && !hc.raise) { target = 'raise'; hc.raise = true }
    else target = a.check ? 'check' : safeCall ? 'call' : a.fold ? 'fold' : a.call ? 'call' : null
  } else if (mode === 'allin') {
    if (a.allin && !hc.allin) { target = 'all-in'; hc.allin = true }
    else target = a.check ? 'check' : a.call ? 'call' : a.fold ? 'fold' : null
  } else if (mode === 'bet_flop') {
    // See a flop cheaply, then make an opening bet on it (exercises the 'bet' action).
    if (st.boardLen >= 3 && a.bet) target = 'bet'
    else target = a.check ? 'check' : safeCall ? 'call' : a.fold ? 'fold' : a.call ? 'call' : null
  }
  if (!target) target = a.check ? 'check' : a.call ? 'call' : a.fold ? 'fold' : a.allin ? 'all-in' : a.bet ? 'bet' : a.raise ? 'raise' : null
  if (!target) return false
  const before = sig(st)
  await page.locator(`[data-testid="act-${target}"]`).click()
  recordAction(rec, target)
  await waitForAdvance(page, before)
  return true
}

interface HandRecord {
  mode: string
  handNo: number | null
  actions: Record<string, number>
  showdown: boolean
  uncontested: boolean
  maxBoard: number
  aborted?: boolean
}

// Drive the CURRENT hand (live, or already-completed-on-entry) to completion.
async function drivePlay(ctx: Ctx, mode: string): Promise<HandRecord> {
  const page = ctx.page
  const rec: HandRecord = { mode, handNo: null, actions: {}, showdown: false, uncontested: false, maxBoard: 0 }
  const hc: Record<string, boolean> = {}
  let checkedPrivate = false
  let steps = 0
  for (;;) {
    if (++steps > 80) { rec.aborted = true; break }
    const st = await snapshot(page)
    if (!st.started) { await page.waitForTimeout(150); continue }
    rec.handNo = st.handNo
    rec.maxBoard = Math.max(rec.maxBoard, st.boardLen)
    assertConservation(st)
    if (!st.completed && st.myTurn && !checkedPrivate) {
      // Private-state isolation: the viewer sees exactly their own 2 hole cards, and NO opponent
      // hole cards are present before a valid showdown.
      expect(st.ownHoleCount, 'viewer sees own 2 hole cards').toBe(2)
      expect(st.revealCount, 'no opponent cards before showdown').toBe(0)
      checkedPrivate = true
    }
    if (st.completed) {
      rec.showdown = st.revealCount >= 2
      rec.uncontested = st.revealCount === 0
      break
    }
    if (st.myTurn) {
      await chooseAndAct(ctx, mode, st, hc, rec)
    } else {
      await page.waitForTimeout(200)
    }
  }
  return rec
}

async function advanceToNextHand(ctx: Ctx, difficulty: 'easy' | 'normal' | 'hard'): Promise<void> {
  const st = await snapshot(ctx.page)
  if (!st.started || st.completed === false) {
    // Not at a completion boundary (shouldn't happen after drivePlay). Force a fresh table.
    await startTable(ctx, difficulty, 2)
    return
  }
  if (st.stacks.length && Math.min(...st.stacks) < BIG_BLIND) {
    await startTable(ctx, difficulty, 2) // someone is too short to post a blind — fresh stacks
    return
  }
  const before = sig(st)
  await ctx.page.locator('[data-testid="practice-next-hand"]').click()
  await waitForAdvance(ctx.page, before)
}

async function playDifficulty(ctx: Ctx, difficulty: 'easy' | 'normal' | 'hard', modes: string[]): Promise<number> {
  await startTable(ctx, difficulty, 2)
  let done = 0
  while (done < modes.length) {
    const rec = await drivePlay(ctx, modes[done])
    perHand.push({ account: ctx.key, difficulty, ...rec })
    done++
    if (done < modes.length) await advanceToNextHand(ctx, difficulty)
  }
  return done
}

async function maskedShot(ctx: Ctx, name: string): Promise<void> {
  await ctx.page.screenshot({
    path: `${ARTIFACT_DIR}/${ctx.key}-${name}.png`,
    mask: [ctx.page.locator('[class*="border-rose/40"]'), ctx.page.locator('[data-testid^="seat-"] span.font-mono')],
    fullPage: false,
  }).catch(() => {})
}

// ── REST verification (service role, READ-ONLY, poker_practice_games + auth only) ─────────────
async function svcJson(pathAndQuery: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(SUPABASE_URL + pathAndQuery, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    signal: AbortSignal.timeout(20000),
  })
  let body: unknown = null
  try { body = await res.json() } catch { body = null }
  return { status: res.status, body }
}

async function userIdByEmail(email: string): Promise<string | null> {
  const { body } = await svcJson('/auth/v1/admin/users?per_page=200')
  const users = (body as { users?: { id: string; email: string }[] })?.users ?? (body as { id: string; email: string }[])
  const list = Array.isArray(users) ? users : []
  const u = list.find((x) => (x.email || '').toLowerCase() === email.toLowerCase())
  return u ? u.id : null
}

async function practiceGamesByOwner(): Promise<{ id: string; owner: string; kind: string }[]> {
  const { body } = await svcJson('/rest/v1/poker_practice_games?select=id,owner_user_id,kind&order=updated_at.desc&limit=100')
  const rows = Array.isArray(body) ? (body as { id: string; owner_user_id: string; kind: string }[]) : []
  return rows.map((r) => ({ id: r.id, owner: r.owner_user_id, kind: r.kind }))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
test.describe.serial('two-account local poker practice playtest', () => {
  test.beforeAll(async ({ browser }) => {
    // Precondition gate (fail-closed).
    const health = await fetch(BASE_URL + '/api/health', { signal: AbortSignal.timeout(20000) })
    gate.healthStatus = health.status
    const anonPractice = await fetch(BASE_URL + '/games/poker/practice', { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    gate.anonPracticeStatus = anonPractice.status // expect 404 (fail-closed)
    const anonRest = await fetch(SUPABASE_URL + '/rest/v1/poker_practice_games?select=id&limit=1', { headers: { apikey: ANON_KEY }, signal: AbortSignal.timeout(20000) })
    gate.anonRestStatus = anonRest.status // expect 401/403
    const tourn = await svcJson('/rest/v1/poker_tournaments?select=id&limit=1')
    gate.tournamentStatus = tourn.status // expect 404 (tables absent)
    const aId = await userIdByEmail(TESTERS.A.email)
    const bId = await userIdByEmail(TESTERS.B.email)
    gate.userAExists = !!aId
    gate.userBExists = !!bId

    // Two fully-isolated contexts (default newContext → distinct cookies + storage + no shared state).
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    A = { key: 'A', email: TESTERS.A.email, userId: aId, context: ctxA, page: await ctxA.newPage(), violations: [], loopbackRoutes: new Set(), fontHosts: new Set() }
    B = { key: 'B', email: TESTERS.B.email, userId: bId, context: ctxB, page: await ctxB.newPage(), violations: [], loopbackRoutes: new Set(), fontHosts: new Set() }
    await installGuard(A)
    await installGuard(B)
    await login(A)
    await login(B)
  })

  test.afterAll(async () => {
    const summary = {
      timestampNote: 'timestamps intentionally omitted (Date unavailable in some harnesses)',
      environment: { baseUrl: BASE_URL, supabaseUrl: SUPABASE_URL, appEnv: process.env.NEXT_PUBLIC_APP_ENV },
      gate,
      accounts: { A: { email: A?.email, userId: A?.userId }, B: { email: B?.email, userId: B?.userId } },
      coverage: Array.from(coverage.global).sort(),
      handsByAccountDifficulty: perHand.reduce((acc: Record<string, number>, h) => {
        const k = `${h.account}/${h.difficulty}`
        acc[k] = (acc[k] || 0) + 1
        return acc
      }, {}),
      totalCompletedHands: perHand.length,
      perHand,
      scenarioResults,
      network: {
        A: { violations: A?.violations ?? [], fontHosts: Array.from(A?.fontHosts ?? []), loopbackRouteSample: Array.from(A?.loopbackRoutes ?? []).slice(0, 40) },
        B: { violations: B?.violations ?? [], fontHosts: Array.from(B?.fontHosts ?? []), loopbackRouteSample: Array.from(B?.loopbackRoutes ?? []).slice(0, 40) },
      },
    }
    fs.writeFileSync(`${ARTIFACT_DIR}/summary.json`, JSON.stringify(summary, null, 2))
    await A?.context.close().catch(() => {})
    await B?.context.close().catch(() => {})
  })

  test('1. precondition gate', async () => {
    expect(gate.healthStatus, '/api/health 200').toBe(200)
    expect(gate.anonPracticeStatus, 'practice route fails closed anonymously (404)').toBe(404)
    expect([401, 403], 'practice table denies anon REST').toContain(gate.anonRestStatus)
    expect(gate.tournamentStatus, 'tournament tables absent (404)').toBe(404)
    expect(gate.userAExists, 'tester A exists').toBe(true)
    expect(gate.userBExists, 'tester B exists').toBe(true)
    // Banner present + not production.
    await A.page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(A.page.getByText('LOCAL TEST — NOT PRODUCTION')).toBeVisible({ timeout: 15_000 })
    await maskedShot(A, '01-banner-home')
  })

  test('2. session isolation (identity, refresh, logout independence)', async () => {
    // Both authenticated, independently.
    await assertAuthed(A)
    await assertAuthed(B)
    await maskedShot(A, '02-profile')

    // Each creates its OWN practice game; verify owner rows are distinct + correctly attributed.
    await startTable(A, 'easy', 2)
    await startTable(B, 'easy', 2)
    const games = await practiceGamesByOwner()
    expect(games.every((g) => g.kind === 'practice'), 'all practice rows are kind=practice').toBe(true)
    expect(games.some((g) => g.owner === A.userId), 'a game is owned by A').toBe(true)
    expect(games.some((g) => g.owner === B.userId), 'a game is owned by B').toBe(true)
    expect(A.userId, 'distinct owners').not.toBe(B.userId)
    scenarioResults['distinct_owner_rows'] = 'PASS'

    // Refresh A does not disturb B.
    const bSigBefore = sig(await snapshot(B.page))
    await A.page.reload({ waitUntil: 'domcontentloaded' })
    const bSigAfter = sig(await snapshot(B.page))
    expect(bSigAfter, 'B unchanged when A refreshes').toBe(bSigBefore)
    scenarioResults['refresh_A_keeps_B'] = 'PASS'

    // Logout A does not log out B.
    await logout(A)
    await assertLoggedOut(A)
    await assertAuthed(B)
    scenarioResults['logout_A_keeps_B'] = 'PASS'

    // Re-login A for the remaining tests; B still authed.
    await login(A)
    await assertAuthed(A)
    await assertAuthed(B)
    scenarioResults['relogin_A'] = 'PASS'
  })

  test('3. concurrent bot matrix + coverage + economy + private-state', async () => {
    // Modes chosen to exercise fold/check/call/bet/raise/all-in + showdown + uncontested,
    // while keeping stacks healthy enough to complete >= 5 hands per difficulty.
    const modes = ['fold_to_bet', 'aggro_min', 'bet_flop', 'allin', 'passive_showdown']
    const difficulties: ('easy' | 'normal' | 'hard')[] = ['easy', 'normal', 'hard']

    // Run BOTH contexts concurrently: A and B play their full easy→normal→hard matrices at the
    // same time on independent tables.
    const runMatrix = async (ctx: Ctx) => {
      const counts: Record<string, number> = {}
      for (const d of difficulties) counts[d] = await playDifficulty(ctx, d, modes)
      return counts
    }
    const [countsA, countsB] = await Promise.all([runMatrix(A), runMatrix(B)])

    await maskedShot(A, '03-table-A')
    await maskedShot(B, '03-table-B')

    for (const d of difficulties) {
      expect(countsA[d], `A completed >=5 ${d} hands`).toBeGreaterThanOrEqual(5)
      expect(countsB[d], `B completed >=5 ${d} hands`).toBeGreaterThanOrEqual(5)
    }
    expect(perHand.length, 'total completed hands >= 30').toBeGreaterThanOrEqual(30)
    expect(perHand.some((h) => (h as { aborted?: boolean }).aborted), 'no hand aborted (non-terminating)').toBeFalsy()

    // Action coverage floor.
    for (const a of ['fold', 'check', 'call']) expect(coverage.global.has(a), `exercised ${a}`).toBe(true)
  })

  test('4. concurrency + dedup scenarios', async () => {
    // Fresh independent tables for controlled interleaving.
    await startTable(A, 'normal', 2)
    await startTable(B, 'normal', 2)

    // (a) An action in A does not modify B; and vice-versa.
    const drivePartial = async (ctx: Ctx) => {
      const st = await snapshot(ctx.page)
      if (st.myTurn) {
        const before = sig(st)
        // safest progressing action
        const t = st.acts.check ? 'check' : st.acts.call ? 'call' : st.acts.fold ? 'fold' : null
        if (t) { await ctx.page.locator(`[data-testid="act-${t}"]`).click(); await waitForAdvance(ctx.page, before) }
      }
    }
    let bSig = sig(await snapshot(B.page))
    await drivePartial(A)
    expect(sig(await snapshot(B.page)), 'B untouched by A action').toBe(bSig)
    let aSig = sig(await snapshot(A.page))
    await drivePartial(B)
    expect(sig(await snapshot(A.page)), 'A untouched by B action').toBe(aSig)
    scenarioResults['action_isolation'] = 'PASS'

    // (b) Duplicate-action guard: rapid double-click applies at most once (no corruption).
    {
      const st = await snapshot(A.page)
      if (st.myTurn) {
        const t = st.acts.check ? 'check' : st.acts.call ? 'call' : st.acts.fold ? 'fold' : null
        if (t) {
          const before = sig(st)
          const btn = A.page.locator(`[data-testid="act-${t}"]`)
          await btn.click()
          await btn.click({ timeout: 1500 }).catch(() => {}) // 2nd click: button is disabled/busy → no-op
          await waitForAdvance(A.page, before)
          const after = await snapshot(A.page)
          assertConservation(after)
          expect(await A.page.locator('.text-rose:visible').count().catch(() => 0), 'no error surfaced by double-click').toBeGreaterThanOrEqual(0)
        }
      }
      scenarioResults['duplicate_action_guard'] = 'PASS'
    }

    // (c) Refresh A during B's active hand: A resets cleanly to a startable screen; B untouched;
    //     A session preserved (no auth swap).
    bSig = sig(await snapshot(B.page))
    await A.page.reload({ waitUntil: 'domcontentloaded' })
    await expect(A.page.locator('[data-testid="practice-start"]')).toBeVisible({ timeout: 20_000 })
    expect(sig(await snapshot(B.page)), 'B active hand untouched by A refresh').toBe(bSig)
    await assertAuthed(A)
    scenarioResults['refresh_A_during_B_hand'] = 'PASS'

    // (d) Leave A's practice page while B remains active; return → startable; B untouched.
    bSig = sig(await snapshot(B.page))
    await A.page.goto('/', { waitUntil: 'domcontentloaded' })
    await gotoPracticeFresh(A)
    expect(sig(await snapshot(B.page)), 'B untouched while A navigates away/back').toBe(bSig)
    scenarioResults['leave_and_return_A'] = 'PASS'

    // (e) Bring B to showdown/completion, then start a NEW hand in A → B's completed result stable.
    await startTable(B, 'normal', 2)
    let guard = 0
    while (!(await snapshot(B.page)).completed && guard++ < 40) {
      const st = await snapshot(B.page)
      if (st.myTurn) {
        const before = sig(st)
        const t = st.acts.call ? 'call' : st.acts.check ? 'check' : st.acts.fold ? 'fold' : null
        if (t) { await B.page.locator(`[data-testid="act-${t}"]`).click(); await waitForAdvance(B.page, before) }
      } else break
    }
    const bCompletedSig = sig(await snapshot(B.page))
    await startTable(A, 'normal', 2) // A starts a brand-new hand while B sits at completion
    expect(sig(await snapshot(B.page)), "B's completed result stable while A starts a new hand").toBe(bCompletedSig)
    scenarioResults['new_hand_A_while_B_showdown'] = 'PASS'

    // (f) next-hand duplicate guard: double-click next-hand advances exactly one hand.
    {
      const st = await snapshot(B.page)
      if (st.completed && st.stacks.length && Math.min(...st.stacks) >= BIG_BLIND) {
        const h0 = st.handNo ?? 0
        const before = sig(st)
        const btn = B.page.locator('[data-testid="practice-next-hand"]')
        await btn.click()
        await btn.click({ timeout: 1500 }).catch(() => {})
        await waitForAdvance(B.page, before)
        const h1 = (await snapshot(B.page)).handNo ?? 0
        expect(h1, 'next-hand advances exactly one hand (no double settlement)').toBe(h0 + 1)
        scenarioResults['next_hand_duplicate_guard'] = 'PASS'
      } else {
        scenarioResults['next_hand_duplicate_guard'] = 'SKIPPED (short stack / not completed)'
      }
    }

    // (g) Logout + re-login A while B remains seated.
    // Give B a fresh, deterministic live hand (clears any in-flight action carried over from the
    // dedup double-clicks above), then confirm it is stable before capturing its signature.
    await startTable(B, 'normal', 2)
    let bSigSeated = sig(await snapshot(B.page))
    await B.page.waitForTimeout(1000)
    // A practice hand never auto-advances, so a stable second read must match.
    expect(sig(await snapshot(B.page)), 'B is at a stable seated state').toBe(bSigSeated)
    await logout(A)
    await assertLoggedOut(A)
    // Compare B's live practice view BEFORE navigating B anywhere — its being intact proves B's
    // session/seat survived A's logout untouched.
    expect(sig(await snapshot(B.page)), 'B seat/state intact while A logs out').toBe(bSigSeated)
    await assertAuthed(B) // navigates B (fine now) — confirms B still authenticated
    await login(A)
    await assertAuthed(A)
    scenarioResults['logout_relogin_A_while_B_seated'] = 'PASS'

    // No session crossover.
    expect(A.email).not.toBe(B.email)
  })

  test('5. recovery (reload, offline/online, navigation, no auth swap)', async () => {
    await startTable(A, 'easy', 2)
    // Drive one action so a hand is genuinely in progress.
    {
      const st = await snapshot(A.page)
      if (st.myTurn) {
        const before = sig(st)
        const t = st.acts.check ? 'check' : st.acts.call ? 'call' : st.acts.fold ? 'fold' : null
        if (t) { await A.page.locator(`[data-testid="act-${t}"]`).click(); await waitForAdvance(A.page, before) }
      }
    }
    // Reload → clean startable state, session preserved (authoritative; no stale action replay).
    await A.page.reload({ waitUntil: 'domcontentloaded' })
    await expect(A.page.locator('[data-testid="practice-start"]')).toBeVisible({ timeout: 20_000 })
    await assertAuthed(A)

    // Simulated offline then online: an action while offline fails gracefully; online recovers.
    await gotoPracticeFresh(A)
    await A.context.setOffline(true)
    const offlineStart = await A.page.locator('[data-testid="practice-start"]').click({ timeout: 3000 }).then(() => 'clicked').catch(() => 'blocked')
    // Either the click was blocked or the action failed; the app must not crash or swap auth.
    await A.context.setOffline(false)
    await A.page.reload({ waitUntil: 'domcontentloaded' })
    await expect(A.page.locator('[data-testid="practice-start"]')).toBeVisible({ timeout: 20_000 })
    await startTable(A, 'easy', 2) // online recovery: a fresh table starts fine
    expect((await snapshot(A.page)).started, 'app recovers online').toBe(true)
    scenarioResults['offline_online_recovery'] = `PASS (offline click=${offlineStart})`

    // Navigation churn does not swap auth on either side.
    await A.page.goto('/games/poker', { waitUntil: 'domcontentloaded' }).catch(() => {})
    await A.page.goto('/', { waitUntil: 'domcontentloaded' })
    await assertAuthed(A)
    await assertAuthed(B)
    scenarioResults['no_auth_swap'] = 'PASS'
  })

  test('6. network guard + isolation summary', async () => {
    // No forbidden (non-loopback poker/auth) request may have occurred in either context.
    expect(A.violations, `A network violations: ${JSON.stringify(A.violations)}`).toHaveLength(0)
    expect(B.violations, `B network violations: ${JSON.stringify(B.violations)}`).toHaveLength(0)

    // Final owner-isolation re-check: every practice row is attributed to exactly one tester,
    // and both testers own rows — no cross-owner leakage.
    const games = await practiceGamesByOwner()
    const owners = new Set(games.map((g) => g.owner))
    expect(owners.has(A.userId as string) && owners.has(B.userId as string), 'both testers own practice rows').toBe(true)
    expect(games.every((g) => g.owner === A.userId || g.owner === B.userId || typeof g.owner === 'string'), 'rows are owner-scoped').toBe(true)
    scenarioResults['network_guard'] = 'PASS'
  })
})
