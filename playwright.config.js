/**
 * Playwright configuration for the TinyHoney landing page.
 *
 * Serves the static site (index.html, css/, js/, assets/) from the project root
 * via a zero-dependency Node static server (tests/server.js), then runs the
 * browser tests (tests/**/*.spec.js) against Chromium.
 *
 * The `testMatch` glob restricts Playwright to `.spec.js` files only, so Jest's
 * `.test.js` files under tests/unit and tests/pbt are never collected here.
 *
 * Requirement references: 19.2, 19.3 (test infrastructure).
 */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js$/,
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'node tests/server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
