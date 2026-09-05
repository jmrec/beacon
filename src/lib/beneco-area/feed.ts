import { createServerFn } from "@tanstack/react-start";
import { env } from "../../env.ts";
import {
  type OutageFeed,
  type OutagePeriod,
  type ScheduledOutage,
  scheduledFeedSchema,
  type UnscheduledOutage,
  unscheduledFeedSchema,
} from "./types/api.ts";

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
): Promise<UnscheduledOutage[]> {
  const raw = await fetchFeed(env.BENECO_UNSCHEDULED_OUTAGE_URL, period);
  return unscheduledFeedSchema.parse(raw);
}

export async function fetchScheduledFeed(
  period: OutagePeriod,
): Promise<ScheduledOutage[]> {
  const raw = await fetchFeed(env.BENECO_SCHEDULED_OUTAGE_URL, period);
  return scheduledFeedSchema.parse(raw);
}

export const getOutages = createServerFn({ method: "GET" })
  .validator((data: { period: OutagePeriod }) => data)
  .handler(async ({ data }) => {
    const [unscheduled, scheduled] = await Promise.all([
      fetchUnscheduledFeed(data.period),
      fetchScheduledFeed(data.period),
    ]);

    return { unscheduled, scheduled } satisfies OutageFeed;
  });
