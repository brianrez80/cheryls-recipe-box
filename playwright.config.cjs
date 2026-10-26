const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/security', testMatch: '*.spec.cjs', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4178', browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL === 'chromium' ? undefined : 'msedge', headless: true },
  webServer: { command: 'node tests/security/serve.cjs', url: 'http://127.0.0.1:4178', reuseExistingServer: false }
});
