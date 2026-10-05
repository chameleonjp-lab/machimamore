import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser-tests', timeout: 60000, expect: { timeout: 15000 },
  workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  use: { baseURL: 'http://127.0.0.1:4176', viewport: { width: 393, height: 852 }, hasTouch: true,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev', url: 'http://127.0.0.1:4176', reuseExistingServer: !process.env.CI, timeout: 30000 },
    { command: 'npm run preview', url: 'http://127.0.0.1:4177', reuseExistingServer: !process.env.CI, timeout: 30000 },
  ],
});
