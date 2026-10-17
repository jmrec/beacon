import type { OutageFeed, OutagePeriod } from "../../outages/types.ts";
import type { OutageProvider } from "../types.ts";
import { fetchBenecoRaw } from "./api.ts";
import {
  benecoRawFeedSchema,
  normalizeScheduled,
  normalizeUnscheduled,
  scheduledItemSchema,
  unscheduledItemSchema,
} from "./schema.ts";
import type { BenecoParsedFeed } from "./types.ts";

export const benecoProvider: OutageProvider<BenecoParsedFeed> = {
  id: "beneco",
  fetchRaw: (period: OutagePeriod) => fetchBenecoRaw(period),
  parse(raw: unknown): BenecoParsedFeed {
    const feed = benecoRawFeedSchema.parse(raw);
    return {
      unscheduled: feed.unscheduled.map((item) =>
        unscheduledItemSchema.parse(item),
      ),
      scheduled: feed.scheduled.map((item) => scheduledItemSchema.parse(item)),
    };
  },
  normalize(parsed): OutageFeed {
    return {
      unscheduled: parsed.unscheduled.map(normalizeUnscheduled),
      scheduled: parsed.scheduled.map(normalizeScheduled),
    };
  },
};
