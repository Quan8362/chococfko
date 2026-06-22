// Playwright config for the Japanese 60-Second Challenge E2E suite.
//
// NOT part of the app build (e2e/ is excluded from tsconfig). To run:
//   npm i -D @playwright/test
//   npx playwright install
//   npx playwright test --config e2e/playwright.config.ts
//
// Set JP60_BASE_URL to target a deployment (defaults to the local dev server,
// which Playwright starts automatically via webServer below).
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.JP60_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: 0,
  use: { baseURL, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [
    { name: 'iphone-se-320', use: { viewport: { width: 320, height: 640 } } },
    { name: 'android-360', use: { viewport: { width: 360, height: 740 } } },
    { name: 'iphone-375', use: { ...devices['iPhone SE'] } },
    { name: 'iphone-390', use: { ...devices['iPhone 12'] } },
    { name: 'android-412', use: { viewport: { width: 412, height: 915 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.JP60_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
})
