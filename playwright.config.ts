import { defineConfig } from '@playwright/test';

/**
 * Playwright para la operación nocturna.
 *
 * baseURL apunta al puerto de la NOCHE (3100), que noche.sh levanta con
 * VITE_USAR_EMULADORES=1. El 3000 puede ser la sesión diurna contra
 * producción: los tests jamás deben correr ahí, y por eso no hay webServer
 * automático — si el 3100 no está arriba, los tests fallan en vez de
 * levantar un server con la configuración equivocada.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: '.noche/reportes/playwright',
  timeout: 30_000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: 'http://localhost:3100',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  reporter: [['list'], ['html', { outputFolder: '.noche/reportes/playwright-html', open: 'never' }]],
});
