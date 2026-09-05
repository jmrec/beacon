import { eq, sql } from "drizzle-orm";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { getClient } from "../../../db.ts";
import { barangays, municipalities } from "../schemas/beneco.ts";

const benecoSchema = { municipalities, barangays } as const;
type BenecoSchema = typeof benecoSchema;
type Municipality = Pick<typeof municipalities.$inferSelect, "id" | "name">;
type Barangay = typeof barangays.$inferSelect & { municipality: string };

let db: NeonHttpDatabase<BenecoSchema> | undefined;

async function getDb(): Promise<NeonHttpDatabase<BenecoSchema> | undefined> {
  const client = await getClient();
  if (!client) return undefined;
  db ??= drizzle(client, { schema: benecoSchema });
  return db;
}

async function listMunicipalities(): Promise<Municipality[]> {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({ id: municipalities.id, name: municipalities.name })
    .from(municipalities)
    .orderBy(municipalities.name);
}

/** Best municipality match: exact (case-insensitive) first, then containment. */
async function findMunicipality(
  name: string,
): Promise<Municipality | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const q = name.trim().toLowerCase();
  if (!q) return undefined;

  const cols = { id: municipalities.id, name: municipalities.name };

  const exact = await db
    .select(cols)
    .from(municipalities)
    .where(sql`lower(${municipalities.name}) = ${q}`)
    .limit(1);
  if (exact.length > 0) return exact[0];

  const contain = await db
    .select(cols)
    .from(municipalities)
    .where(
      sql`lower(${municipalities.name}) like ${`%${q}%`}
        or ${q} like '%' || lower(${municipalities.name}) || '%'`,
    )
    .orderBy(sql`length(${municipalities.name}) asc`)
    .limit(1);
  return contain.length > 0 ? contain[0] : undefined;
}

async function suggestMunicipalities(
  name: string,
  limit = 5,
): Promise<Municipality[]> {
  const db = await getDb();
  if (!db) return [];
  const q = name.trim().toLowerCase();
  if (!q) return [];
  return await db
    .select({ id: municipalities.id, name: municipalities.name })
    .from(municipalities)
    .where(
      sql`lower(${municipalities.name}) like ${`%${q}%`}
        or ${q} like '%' || lower(${municipalities.name}) || '%'`,
    )
    .orderBy(sql`length(${municipalities.name}) asc`)
    .limit(limit);
}

async function barangaysForMunicipality(
  municipalityId: number,
): Promise<Barangay[]> {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({
      id: barangays.id,
      name: barangays.name,
      pcode: barangays.pcode,
      municipality: municipalities.name,
      municipalityId: municipalities.id,
    })
    .from(barangays)
    .innerJoin(municipalities, eq(municipalities.id, barangays.municipalityId))
    .where(eq(barangays.municipalityId, municipalityId))
    .orderBy(barangays.name);
}

export {
  listMunicipalities,
  findMunicipality,
  suggestMunicipalities,
  barangaysForMunicipality,
};
