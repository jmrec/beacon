import { env } from "../../env.ts";
import type { OutagePeriod } from "../../outages/types.ts";
import type { BenecoRawFeed } from "./types.ts";

async function fetchFeed(
  url: string | undefined,
  period: OutagePeriod,
): Promise<unknown[]> {
  if (!url) return [];
  const response = await fetch(`${url}?period=${period}`);
  if (!response.ok) {
    throw new Error(
      `BENECO request failed: ${response.status} ${response.statusText}`,
    );
  }
  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) throw new Error("BENECO response must be an array");
  return raw;
}

export async function fetchBenecoRaw(
  period: OutagePeriod,
): Promise<BenecoRawFeed> {
  const [unscheduled, scheduled] = await Promise.all([
    fetchFeed(env.BENECO_UNSCHEDULED_OUTAGE_URL, period),
    fetchFeed(env.BENECO_SCHEDULED_OUTAGE_URL, period),
  ]);
  return { unscheduled, scheduled };
}
