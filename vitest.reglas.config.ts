import { defineConfig } from 'vitest/config';

/**
 * Los tests de reglas necesitan emuladores y tardan; van aparte del `vitest
 * run` de todos los días, que debe seguir siendo instantáneo. Se corren con
 * `npm run test:reglas`, que los levanta solo.
 */
export default defineConfig({
  test: { include: ['tests/reglas/**/*.test.ts'], testTimeout: 20_000, hookTimeout: 30_000 },
});
