import { createServerFn } from "@tanstack/react-start";

export type OutagePeriod = "today" | "this_week" | "last_week";

export interface UnscheduledOutage {
  id: number;
  feeder: string;
  area: string;
  cause: string;
  timeoff: string;
  timerestored: string;
  duration: string;
  status: string;
  legacy_photos: unknown[];
  latest_update: string | null;
  updates: unknown[];
}

export interface ScheduledOutage {
  id: number;
  intrtype: string;
  feeder: string;
  deenergized: string;
  poleid: string;
  areas: string;
  date: string;
  timeoff: string;
  timerestored: string;
  purpose: string;
  logged: number;
  noofcons: number;
  remarks: string;
  cancelled: number;
}

export interface OutageFeed {
  unscheduled: UnscheduledOutage[];
  scheduled: ScheduledOutage[];
}

async function fetchFeed(url: string | undefined, period: OutagePeriod) {
  if (!url) return [];
  const res = await fetch(`${url}?period=${period}`);
  if (!res.ok) {
    throw new Error(`BENECO request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const getOutages = createServerFn({ method: "GET" })
  .validator((data: { period: OutagePeriod }) => data)
  .handler(async ({ data }) => {
    const [unscheduled, scheduled] = await Promise.all([
      fetchFeed(process.env.BENECO_UNSCHEDULED_OUTAGE_URL, data.period),
      fetchFeed(process.env.BENECO_SCHEDULED_OUTAGE_URL, data.period),
    ]);

    return { unscheduled, scheduled } satisfies OutageFeed;
  });
