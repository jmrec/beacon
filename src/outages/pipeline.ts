import type { OutageProvider } from "../providers/types.ts";
import type { OutageFeed, OutagePeriod } from "./types.ts";

export async function fetchOutages<Parsed>(
  provider: OutageProvider<Parsed>,
  period: OutagePeriod,
): Promise<OutageFeed> {
  const raw = await provider.fetchRaw(period);
  return provider.normalize(provider.parse(raw));
}
