import { defineConfig } from 'drizzle-kit';
export default defineConfig({ schema: './db/live-schema.ts', out: './drizzle', dialect: 'sqlite' });
