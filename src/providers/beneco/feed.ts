import { createServerFn } from "@tanstack/react-start";
import { fetchOutages } from "../../outages/pipeline.ts";
import type { OutageFeed, OutagePeriod } from "../../outages/types.ts";
import { benecoProvider } from "./provider.ts";

export async function fetchUnscheduledFeed(
  period: OutagePeriod,
): Promise<OutageFeed["unscheduled"]> {
  return (await fetchBenecoFeed(period)).unscheduled;
}

export async function fetchScheduledFeed(
  period: OutagePeriod,
): Promise<OutageFeed["scheduled"]> {
  return (await fetchBenecoFeed(period)).scheduled;
}

async function fetchBenecoFeed(period: OutagePeriod): Promise<OutageFeed> {
  return fetchOutages(benecoProvider, period);
}

export const getOutages = createServerFn({ method: "GET" })
  .validator((data: { period: OutagePeriod }) => data)
  .handler(
    async ({ data }): Promise<OutageFeed> => fetchBenecoFeed(data.period),
  );

export const getOutageFeedForMap = createServerFn({ method: "GET" })
  .validator((data: { period: OutagePeriod }) => data)
  .handler(
    async ({ data }): Promise<OutageFeed> => fetchBenecoFeed(data.period),
  );
