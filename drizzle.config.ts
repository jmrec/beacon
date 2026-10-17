import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env.local', '.env'], override: true })

export default defineConfig({
  out: './drizzle',
  schema: './src/lib/outages/schemas/dedup.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
