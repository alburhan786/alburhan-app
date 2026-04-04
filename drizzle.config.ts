import type { Config } from "drizzle-kit";

export default {
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: (process.env.APP_DB_URL || process.env.DATABASE_URL)!,
  },
} satisfies Config;
