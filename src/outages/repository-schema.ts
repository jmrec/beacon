import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type {
  AreaResolution,
  AreaTask,
} from "../providers/beneco/area-types.ts";

export const resolvedOutages = pgTable(
  "resolved_outages",
  {
    companyId: varchar("company_id", { length: 64 })
      .notNull()
      .default("beneco"),
    outageId: bigint("outage_id", { mode: "number" }).notNull(),
    kind: varchar("kind", { length: 16 }).$type<AreaTask["kind"]>().notNull(),
    key: varchar("key", { length: 40 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    resolution: jsonb("resolution").$type<AreaResolution>().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.outageId] }),
    index("resolved_outages_resolved_at_idx").on(table.resolvedAt),
  ],
);
