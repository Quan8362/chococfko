// Playwright config for the TOURNAMENT E2E suite (Prompt 13). NOT part of the app build.
//
// Targets a LOCAL Supabase stack ONLY (WSL2/Docker; Kong :54421). Keys + emails come from the
// gitignored e2e/tournaments/.env.stack.local (parsed by _env.ts). Quick start:
//   npx playwright test --config e2e/tournaments/tournaments.config.ts
// Single scenario:  … --project crud    Critical-twice: run the project, then run it again.
import { defineConfig, devices } from '@playwright/test'
import {
  BASE_URL, ARTIFACT_DIR, SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY,
  ADMIN_EMAIL, adminStateFile, userStateFile,
} from './_env'

const isCI = !!process.env.CI
const desktop = devices['Desktop Chrome']

// Every scenario project depends on `setup` (which provisions the two auth states) and defaults to a
// desktop viewport. Auth is applied per-describe inside specs via test.use({ storageState }); the
// project default is anonymous (no storageState) so guest tests are truly unauthenticated.
// Anchor the file match with a path separator + end-of-string so e.g. the `knockout` project does not
// also pick up `group-knockout.spec.ts`.
const scenario = (name: string, file: string) => ({
  name,
  testMatch: new RegExp(`[\\\\/]${file.replace(/\./g, '\\.')}$`),
  dependencies: ['setup'],
  use: { ...desktop },
})

export default defineConfig({
  testDir: '.',
  outputDir: `${ARTIFACT_DIR}/results`,
  timeout: 60_000,
  globalTimeout: 45 * 60_000,
  expect: { timeout: 12_000 },
  retries: isCI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${ARTIFACT_DIR}/html`, open: 'never' }],
    ['json', { outputFile: `${ARTIFACT_DIR}/results.json` }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    scenario('permissions', 'permissions.spec.ts'),
    scenario('authorization', 'authorization.spec.ts'),
    scenario('crud', 'crud.spec.ts'),
    scenario('public', 'public.spec.ts'),
    scenario('routes', 'routes.spec.ts'),
    scenario('console-network', 'console-network.spec.ts'),
    scenario('a11y', 'a11y.spec.ts'),
    scenario('responsive', 'responsive.spec.ts'),
    scenario('round-robin', 'round-robin.spec.ts'),
    scenario('tie', 'tie.spec.ts'),
    scenario('knockout', 'knockout.spec.ts'),
    scenario('group-knockout', 'group-knockout.spec.ts'),
    scenario('realtime', 'realtime.spec.ts'),
  ],
  metadata: { adminStateFile, userStateFile, admin: ADMIN_EMAIL },
  webServer: /localhost|127\.0\.0\.1/.test(BASE_URL)
    ? {
        command:
          process.env.TNMT_E2E_WEB_CMD ||
          'npx next dev -p 3100',
        // Playwright defaults webServer.cwd to the CONFIG file's directory (e2e/tournaments); Next must
        // be spawned from the app root so it finds app/. The npm scripts run from the web root (cwd).
        cwd: process.cwd(),
        url: BASE_URL,
        reuseExistingServer: !isCI,
        timeout: 180_000,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
          ADMIN_EMAILS: ADMIN_EMAIL,
          NEXT_PUBLIC_SITE_URL: BASE_URL,
          PORT: '3100',
        },
      }
    : undefined,
})
