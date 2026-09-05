import {
  bigint,
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type { AreaResolution, AreaTask } from "../types/internal.ts";

export const resolvedOutages = pgTable(
  "resolved_outages",
  {
    outageId: bigint("outage_id", { mode: "number" }).primaryKey(),
    kind: varchar("kind", { length: 16 }).$type<AreaTask["kind"]>().notNull(),
    key: varchar("key", { length: 40 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    resolution: jsonb("resolution").$type<AreaResolution>().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("resolved_outages_resolved_at_idx").on(table.resolvedAt),
  ],
);
