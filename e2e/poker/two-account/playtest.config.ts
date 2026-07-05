// Playwright config for the TWO-ACCOUNT local poker practice playtest (Prompt 27F-B3).
//
// LOCALHOST ONLY. Reuses the already-running local dev server (started with .env.playtest.local).
// Tracing + video are DISABLED on purpose: a DOM-snapshot trace of a live poker hand would
// capture private hole cards, which this suite must never record. Artifacts are limited to a
// privacy-safe JSON summary + masked screenshots produced explicitly by the spec.
import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, ARTIFACT_DIR, assertLoopbackOrThrow } from './_playtest-env'

assertLoopbackOrThrow()

export default defineConfig({
  testDir: '.',
  testMatch: /two-account\.spec\.ts/,
  outputDir: `${ARTIFACT_DIR}/results`,
  timeout: 12 * 60_000, // the concurrent bot matrix drives 30+ real hands through the UI
  globalTimeout: 40 * 60_000,
  expect: { timeout: 20_000 },
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: `${ARTIFACT_DIR}/results.json` }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    ...devices['Desktop Chrome'],
  },
  // Reuse the running local server. The fallback command (only used if nothing is listening)
  // starts Next with the isolated playtest env so it can never come up as production.
  webServer: {
    command: 'node --env-file=.env.playtest.local node_modules/next/dist/bin/next dev -p 3000',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    cwd: process.cwd(),
  },
})
