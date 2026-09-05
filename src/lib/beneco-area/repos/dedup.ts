import { createHash } from "node:crypto";
import { inArray, notInArray, sql } from "drizzle-orm";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { getClient } from "../../../db.ts";
import { resolvedOutages } from "../schemas/dedup.ts";
import type { AreaResolution, AreaTask } from "../types/internal.ts";

export function fingerprintText(text: string): string {
  return createHash("sha256").update(normalizeAreaText(text)).digest("hex");
}

function normalizeAreaText(text: string): string {
  return text.trim().replace(/\r\n?/g, "\n");
}

export interface ResolutionRow {
  outageId: AreaTask["outageId"];
  kind: AreaTask["kind"];
  key: string;

  /** sha256 fingerprint of the normalized area text that produced this row. */
  fingerprint: string;

  resolution: AreaResolution;
  resolvedAt: Date;
}

export interface ResolutionWrite {
  outageId: AreaTask["outageId"];
  kind: AreaTask["kind"];
  key: string;
  fingerprint: string;
  resolution: AreaResolution;
}

type ResolvedOutagesDb = NeonHttpDatabase<{
  resolvedOutages: typeof resolvedOutages;
}>;

let db: ResolvedOutagesDb | undefined;

async function getStoreDb(): Promise<ResolvedOutagesDb> {
  if (db) return db;
  const client = await getClient();
  if (!client) {
    throw new Error("DATABASE_URL is not set; cannot reach the durable store");
  }
  db = drizzle(client, { schema: { resolvedOutages } });
  return db;
}

export async function getResolvedOutageRows(
  outageIds: AreaTask["outageId"][],
): Promise<ResolutionRow[]> {
  if (outageIds.length === 0) return [];
  const storeDb = await getStoreDb();
  const rows = await storeDb
    .select()
    .from(resolvedOutages)
    .where(inArray(resolvedOutages.outageId, outageIds));
  return rows;
}

/** Insert or refresh stored resolutions for outages the resolver just ran on. */
export async function upsertResolvedOutageRows(
  rows: ResolutionWrite[],
): Promise<void> {
  if (rows.length === 0) return;
  const storeDb = await getStoreDb();
  await storeDb
    .insert(resolvedOutages)
    .values(
      rows.map((row) => ({
        outageId: row.outageId,
        kind: row.kind,
        key: row.key,
        fingerprint: row.fingerprint,
        resolution: row.resolution,
        resolvedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: resolvedOutages.outageId,
      set: {
        kind: sql`excluded.kind`,
        key: sql`excluded.key`,
        fingerprint: sql`excluded.fingerprint`,
        resolution: sql`excluded.resolution`,
        resolvedAt: sql`excluded.resolved_at`,
      },
    });
}

/**
 * Delete stored rows whose outage ids are no longer present in `liveOutageIds`.
 * Pass an empty array to clear the table entirely.
 */
export async function pruneResolvedOutages(
  liveOutageIds: AreaTask["outageId"][],
): Promise<void> {
  const storeDb = await getStoreDb();
  if (liveOutageIds.length === 0) {
    await storeDb.delete(resolvedOutages);
    return;
  }
  await storeDb
    .delete(resolvedOutages)
    .where(notInArray(resolvedOutages.outageId, liveOutageIds));
}
