import { defineConfig } from "@playwright/test";

// Playwright tampoco pasa por Next.js: carga el entorno aca, una sola vez.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin .env.local (CI inyecta las variables). tests/setup.ts no aplica a e2e:
  // el servidor que levanta webServer valida su propio entorno al arrancar.
}

// Puerto propio de e2e. El servidor de humo (scripts/smoke-http.sh) usa 3100.
// Dos puertos distintos, cada uno con un unico dueno, para que nunca choquen.
const PORT = 3101;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // El bundle de diseno vive en blueprints/ dentro del proyecto: fuera del barrido.
  testIgnore: ["**/blueprints/**", "**/node_modules/**"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile",
      testIgnore: /perf-poster\.spec\.ts/,
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      testIgnore: /perf-poster\.spec\.ts/,
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // Proyecto dedicado al presupuesto de bytes del poster sobre red lenta.
      // El throttling real lo aplica el propio spec via CDP.
      name: "slow-4g",
      testMatch: /perf-poster\.spec\.ts/,
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
