import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/serveur/base/schema.ts',
  out: './src/serveur/base/migrations',
});
