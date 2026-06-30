// Playwright config for the Tiến Lên Miền Nam multiplayer E2E suite.
//
// NOT part of the app build. To run:
//   npm i -D @playwright/test && npx playwright install --with-deps chromium
//   npm run test:e2e:tlmn               # safe specs (realtime transport + responsive)
//   TLMN_E2E_WRITE=1 TLMN_E2E_ALLOW_PROD=1 TLMN_E2E_BASE_URL=https://… \
//     npm run test:e2e:tlmn:full        # live two-player write flow (see README)
//
// Two fully isolated browser contexts (Player A / Player B) are created inside the
// multiplayer spec from the storageState files written by auth.setup.ts.
import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, ARTIFACT_DIR } from './_env'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: '.',
  outputDir: ARTIFACT_DIR,
  timeout: 90_000,
  globalTimeout: 25 * 60_000,
  expect: { timeout: 15_000 },
  // Retry browser tests a LIMITED number of times in CI (never to mask real failures);
  // traces/videos are retained on failure so retries stay diagnosable.
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
    // Provisions test users + writes storageState. Only does real work when WRITE_OK.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // SAFE specs — no DB writes, no auth needed.
    { name: 'realtime', testMatch: /realtime-transport\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'responsive', testMatch: /responsive\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },

    // Live two-player write flow — depends on setup; full trace/video for diagnostics.
    {
      name: 'multiplayer',
      testMatch: /multiplayer\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], trace: 'on', video: 'on' },
    },
  ],

  // Auto-start a local server only when targeting localhost. The command is overridable
  // (TLMN_E2E_WEB_CMD) so CI can inject placeholder public env into the app process while
  // the realtime test still uses the real public anon key for its own ephemeral client.
  webServer: /localhost|127\.0\.0\.1/.test(BASE_URL)
    ? {
        command: process.env.TLMN_E2E_WEB_CMD || 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !isCI,
        timeout: 180_000,
      }
    : undefined,
})
