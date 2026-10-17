import type { OutageFeed, OutagePeriod } from "../outages/types.ts";

export interface OutageProvider<Parsed = unknown> {
  readonly id: string;
  fetchRaw(period: OutagePeriod): Promise<unknown>;
  parse(raw: unknown): Parsed;
  normalize(parsed: Parsed): OutageFeed;
}
