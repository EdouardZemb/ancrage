import { defineConfig } from 'vitest/config';

// Le fuseau des tests, en CI (UTC) comme sur un poste : les nuits de 23 h et de 25 h y
// existent, et les tests du jour local et du changement d'heure mordent partout. Posé dans le
// processus qui lit cette configuration, avant que les tests ne démarrent : Stryker fait tourner
// Vitest dans des fils (`pool: 'threads'`), où un `TZ` posé par `test.env` reste sans effet sur
// l'heure locale.
process.env.TZ = 'Europe/Zurich';

export default defineConfig({
  // Constante, sans lire `REVISION` : les tests restent déterministes.
  define: { __ANCRAGE_REVISION__: JSON.stringify('local') },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/*.test.ts'],
    // Au premier passage, à froid, des tests WebAuthn dépassent les 5 s par défaut.
    testTimeout: 15000,
  },
});
