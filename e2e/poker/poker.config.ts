// Playwright config for the POKER E2E suite. NOT part of the app build.
//
// Quick start (against a throwaway Supabase preview branch — never production):
//   npm i -D @playwright/test && npx playwright install --with-deps chromium
//   # 1) point the app + tests at the branch, then start the app:
//   POKER_E2E_SUPABASE_URL=https://<branch-ref>.supabase.co \
//   POKER_E2E_ANON_KEY=<branch anon> POKER_E2E_SERVICE_ROLE_KEY=<branch service> \
//   npm run test:e2e:poker
//
// Projects:
//   setup            — provisions the 6 players + storageState (only when WRITE_OK)
//   smoke            — public poker pages render with no console errors (no writes)
//   responsive       — landscape viewport matrix + screenshots (no writes)
//   coin-conservation— headless service-role full-hand session-conservation (branch only)
//   multiplayer      — live N-player hands driven through the UI (branch only; depends on setup)
import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, ARTIFACT_DIR } from './_env'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: '.',
  outputDir: `${ARTIFACT_DIR}/results`,
  timeout: 90_000,
  globalTimeout: 30 * 60_000,
  expect: { timeout: 15_000 },
  retries: isCI ? 2 : 0,
  fullyParallel: false,
  forbidOnly: isCI,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${ARTIFACT_DIR}/html`, open: 'never' }],
    ['json', { outputFile: `${ARTIFACT_DIR}/results.json` }],
    ['junit', { outputFile: `${ARTIFACT_DIR}/junit.xml` }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: isCI ? 'on-first-retry' : 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'smoke', testMatch: /smoke\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'responsive', testMatch: /responsive\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Accessibility + orientation (portrait fallback, keyboard/focus-order, reduced-motion) against
    // the real /games/poker/preview showcase. No auth, no DB writes.
    { name: 'a11y', testMatch: /a11y-orientation\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'coin-conservation', testMatch: /coin-conservation\.spec\.ts/ },
    {
      name: 'multiplayer',
      testMatch: /multiplayer\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], trace: 'on', video: 'on' },
    },
  ],
  webServer: /localhost|127\.0\.0\.1/.test(BASE_URL)
    ? {
        command: process.env.POKER_E2E_WEB_CMD || 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !isCI,
        timeout: 180_000,
        // Poker ships behind flags that default OFF (public routes 404 otherwise).
        // The e2e app-under-test explicitly turns the public capabilities on so the
        // smoke/responsive/multiplayer specs exercise the real pages.
        env: {
          ...process.env,
          POKER_ENABLED: 'true',
          POKER_CREATE_TABLE_ENABLED: 'true',
          POKER_PUBLIC_LOBBY_ENABLED: 'true',
          POKER_PRIVATE_TABLE_ENABLED: 'true',
          POKER_SPECTATOR_ENABLED: 'true',
        },
      }
    : undefined,
})
