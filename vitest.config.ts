import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // `functions/` entra para poder probar la lógica pura del proxy —qué
    // significa cada respuesta de n8n— sin montar las Cloud Functions.
    include: ['src/**/*.test.ts', 'functions/src/**/*.test.ts'],
  },
});
