import { and, desc, eq, gte, sql } from "drizzle-orm";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { getClient } from "../../db.ts";
import { barangays, municipalities } from "./schema.ts";

interface Municipality {
  id: number;
  name: string;
}

interface Barangay {
  id: number;
  name: string;
  municipality: string;
  municipalityId: number;

  /** Philippine barangay geographic code, when present (nullable in source). */
  pcode: string | null;
}

interface BarangayMatch extends Barangay {
  /** Normalised 0..1 relevance of the name against the search query. */
  score: number;
}

type BenecoSchema = {
  municipalities: typeof municipalities;
  barangays: typeof barangays;
};

let db: NeonHttpDatabase<BenecoSchema> | undefined;

async function getDb(): Promise<NeonHttpDatabase<BenecoSchema> | undefined> {
  const client = await getClient();
  if (!client) return undefined;
  db ??= drizzle(client, { schema: { municipalities, barangays } });
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

async function searchBarangays(opts: {
  query: string;
  municipalityId?: number;
  limit?: number;
}): Promise<BarangayMatch[]> {
  const db = await getDb();
  if (!db) return [];
  const q = opts.query.trim().toLowerCase();
  if (!q) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 20));

  const score = sql<number>`
    greatest(
      coalesce(similarity(lower(${barangays.name}), ${q}), 0),
      coalesce(word_similarity(${q}, lower(${barangays.name})), 0)
    )`;

  const conditions = [gte(score, 0.25)];
  if (opts.municipalityId != null) {
    conditions.push(eq(barangays.municipalityId, opts.municipalityId));
  }

  return await db
    .select({
      id: barangays.id,
      name: barangays.name,
      pcode: barangays.pcode,
      municipality: municipalities.name,
      municipalityId: municipalities.id,
      score,
    })
    .from(barangays)
    .innerJoin(municipalities, eq(municipalities.id, barangays.municipalityId))
    .where(and(...conditions))
    .orderBy(desc(score), barangays.name)
    .limit(limit);
}

interface BarangayNameMatch {
  /** The original name token the model asked about. */
  input: string;
  /** Best fuzzy match, or null when nothing cleared the similarity bar. */
  match: BarangayMatch | null;
}

async function fuzzyMatchBarangays(opts: {
  names: string[];
  municipalityId?: number;
}): Promise<BarangayNameMatch[]> {
  const out: BarangayNameMatch[] = [];
  for (const input of opts.names) {
    const q = input.trim().toLowerCase();
    if (!q) {
      out.push({ input, match: null });
      continue;
    }
    const best = await searchBarangays({
      query: q,
      municipalityId: opts.municipalityId,
      limit: 1,
    });
    out.push({ input, match: best[0] ?? null });
  }
  return out;
}

export {
  listMunicipalities,
  findMunicipality,
  suggestMunicipalities,
  barangaysForMunicipality,
  searchBarangays,
  fuzzyMatchBarangays,
};
