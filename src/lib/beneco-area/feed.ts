import { createServerFn } from "@tanstack/react-start";
import { env } from "../../env.ts";
import {
  type OutageFeed,
  type OutagePeriod,
  scheduledFeedSchema,
  unscheduledFeedSchema,
} from "./types/api.ts";
import type { Outage } from "./types/internal.ts";


async function fetchFeed(url: string | undefined, period: OutagePeriod) {
  if (!url) return [];
  const res = await fetch(`${url}?period=${period}`);
  if (!res.ok) {
    throw new Error(`BENECO request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchUnscheduledFeed(
  period: OutagePeriod,
): Promise<Outage[]> {
  const raw = await fetchFeed(env.BENECO_UNSCHEDULED_OUTAGE_URL, period);
  return unscheduledFeedSchema.parse(raw);
}

export async function fetchScheduledFeed(
  period: OutagePeriod,
): Promise<Outage[]> {
  const raw = await fetchFeed(env.BENECO_SCHEDULED_OUTAGE_URL, period);
  return scheduledFeedSchema.parse(raw);
}

async function fetchFeedFor(period: OutagePeriod): Promise<OutageFeed> {
  const [unscheduled, scheduled] = await Promise.all([
    fetchUnscheduledFeed(period),
    fetchScheduledFeed(period),
  ]);
  return { unscheduled, scheduled };
}

export const getOutages = createServerFn({ method: "GET" })
  .validator((data: { period: OutagePeriod }) => data)
  .handler(async ({ data }): Promise<OutageFeed> => fetchFeedFor(data.period));

export const getOutageFeedForMap = createServerFn({ method: "GET" })
  .validator((data: { period: OutagePeriod }) => data)
  .handler(async ({ data }): Promise<OutageFeed> => fetchFeedFor(data.period));
