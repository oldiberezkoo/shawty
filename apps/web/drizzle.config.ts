import { defineConfig } from 'drizzle-kit'
import { dataPath } from './src/config/paths'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? dataPath('shawty.db'),
  },
  strict: true,
  verbose: true,
})
