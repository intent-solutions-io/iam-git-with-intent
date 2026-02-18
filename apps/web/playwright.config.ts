/**
 * Playwright Configuration for Browser Evidence Capture
 *
 * Code Factory Pattern 7: Browser evidence as first-class proof.
 * Captures screenshots and videos of critical UI flows for the GWI dashboard.
 */

import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'e2e/report' }],
    ['json', { outputFile: 'e2e/results/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    // Capture evidence on every test
    screenshot: 'on',
    video: 'on-first-retry',
    trace: 'on-first-retry',
    // Viewport for consistent screenshots
    viewport: { width: 1280, height: 720 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start dev server if not in CI (CI provides its own)
  webServer: CI ? undefined : {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
