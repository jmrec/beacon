import { createServerFn } from "@tanstack/react-start";
import type {
  OutageFeed,
  OutagePeriod,
  ScheduledOutage,
  UnscheduledOutage,
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
  return (await fetchFeed(
    process.env.BENECO_UNSCHEDULED_OUTAGE_URL,
    period,
  )) satisfies UnscheduledOutage[];
}

export async function fetchScheduledFeed(
  period: OutagePeriod,
): Promise<ScheduledOutage[]> {
  return (await fetchFeed(
    process.env.BENECO_SCHEDULED_OUTAGE_URL,
    period,
  )) satisfies ScheduledOutage[];
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
