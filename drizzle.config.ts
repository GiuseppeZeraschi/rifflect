import { defineConfig } from 'drizzle-kit';

// `driver: 'expo'` makes drizzle-kit also emit migrations.js, which bundles the SQL files into the
// app (via babel-plugin-inline-import) for `useMigrations` at start-up.
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/data/db/schema.ts',
  out: './src/data/db/migrations',
});
