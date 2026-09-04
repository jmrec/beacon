import { getClient } from "../../db.ts";

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

type Row = Record<string, unknown>;

function toMunicipality(row: Row): Municipality {
  return { id: Number(row.id), name: String(row.name) };
}

function toBarangay(row: Row): Barangay {
  return {
    id: Number(row.id),
    name: String(row.name),
    municipality: String(row.municipality),
    municipalityId: Number(row.municipality_id),
    pcode: row.pcode == null ? null : String(row.pcode),
  };
}

async function listMunicipalities(): Promise<Municipality[]> {
  const sql = await getClient();
  if (!sql) return [];
  const rows = (await sql`
    select id::int as id, name
    from beneco.municipalities
    order by name asc
  `) as Row[];
  return rows.map(toMunicipality);
}

/** Best municipality match: exact (case-insensitive) first, then containment. */
async function findMunicipality(
  name: string,
): Promise<Municipality | undefined> {
  const sql = await getClient();
  if (!sql) return undefined;
  const q = name.trim().toLowerCase();
  if (!q) return undefined;

  let rows = (await sql`
    select id::int as id, name
    from beneco.municipalities
    where lower(name) = ${q}
    limit 1
  `) as Row[];
  if (rows.length > 0) return toMunicipality(rows[0]);

  rows = (await sql`
    select id::int as id, name
    from beneco.municipalities
    where lower(name) like ${`%${q}%`} or ${q} like '%' || lower(name) || '%'
    order by length(name) asc
    limit 1
  `) as Row[];
  return rows.length > 0 ? toMunicipality(rows[0]) : undefined;
}

async function suggestMunicipalities(
  name: string,
  limit = 5,
): Promise<Municipality[]> {
  const sql = await getClient();
  if (!sql) return [];
  const q = name.trim().toLowerCase();
  if (!q) return [];
  const rows = (await sql`
    select id::int as id, name
    from beneco.municipalities
    where lower(name) like ${`%${q}%`} or ${q} like '%' || lower(name) || '%'
    order by length(name) asc
    limit ${limit}
  `) as Row[];
  return rows.map(toMunicipality);
}

async function barangaysForMunicipality(
  municipalityId: number,
): Promise<Barangay[]> {
  const sql = await getClient();
  if (!sql) return [];
  const rows = (await sql`
    select b.id::int as id, b.name, b.pcode, m.name as municipality, m.id::int as municipality_id
    from beneco.barangays b
    join beneco.municipalities m on m.id = b.municipality_id
    where b.municipality_id = ${municipalityId}
    order by b.name asc
  `) as Row[];
  return rows.map(toBarangay);
}

async function searchBarangays(opts: {
  query: string;
  municipalityId?: number;
  limit?: number;
}): Promise<BarangayMatch[]> {
  const sql = await getClient();
  if (!sql) return [];
  const q = opts.query.trim().toLowerCase();
  if (!q) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 20));
  const mun = opts.municipalityId;

  const rows: Row[] =
    mun == null
      ? ((await sql`
            select b.id::int as id, b.name, b.pcode,
                   m.name as municipality, m.id::int as municipality_id,
                   greatest(
                     coalesce(similarity(lower(b.name), ${q}), 0),
                     coalesce(word_similarity(${q}, lower(b.name)), 0)
                   ) as score
            from beneco.barangays b
            join beneco.municipalities m on m.id = b.municipality_id
            where greatest(
                    coalesce(similarity(lower(b.name), ${q}), 0),
                    coalesce(word_similarity(${q}, lower(b.name)), 0)
                  ) >= 0.25
            order by score desc, b.name asc
            limit ${limit}
          `) as Row[])
      : ((await sql`
            select b.id::int as id, b.name, b.pcode,
                   m.name as municipality, m.id::int as municipality_id,
                   greatest(
                     coalesce(similarity(lower(b.name), ${q}), 0),
                     coalesce(word_similarity(${q}, lower(b.name)), 0)
                   ) as score
            from beneco.barangays b
            join beneco.municipalities m on m.id = b.municipality_id
            where b.municipality_id = ${mun}
              and greatest(
                    coalesce(similarity(lower(b.name), ${q}), 0),
                    coalesce(word_similarity(${q}, lower(b.name)), 0)
                  ) >= 0.25
            order by score desc, b.name asc
            limit ${limit}
          `) as Row[]);
  return rows.map((r) => ({ ...toBarangay(r), score: Number(r.score) }));
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
