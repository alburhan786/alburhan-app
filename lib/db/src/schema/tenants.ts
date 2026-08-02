import { pgTable, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── tenants ────────────────────────────────────────────────────────────────────
// SaaS Phase 2: root isolation unit. Each tenant owns its own rows across all
// business tables via a nullable `tenant_id UUID` FK (NOT NULL enforced in Phase 3).
// The default Al Burhan tenant UUID is deterministic/fixed:
//   10000000-1000-4000-8000-000000000001
// ──────────────────────────────────────────────────────────────────────────────

export const tenantsTable = pgTable("tenants", {
  id:        uuid("id").primaryKey().defaultRandom(),
  slug:      text("slug").notNull().unique(),
  name:      text("name").notNull(),
  plan:      text("plan").notNull().default("starter"),
  status:    text("status").notNull().default("active"),
  settings:  jsonb("settings").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;

// ── Canonical ABT default tenant UUID ─────────────────────────────────────────
export const DEFAULT_TENANT_ID = "10000000-1000-4000-8000-000000000001" as const;
