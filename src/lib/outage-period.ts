import { Store } from "@tanstack/store";
import type { OutagePeriod } from "#/lib/beneco-area/types/internal.ts";

export const PERIOD_OPTIONS: { value: OutagePeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
];

export const getPeriodLabel = (period: OutagePeriod): string => {
  const option = PERIOD_OPTIONS.find((o) => o.value === period);
  return option ? option.label : period;
}

export const outagePeriodStore = new Store<{ period: OutagePeriod }>({
  period: "today",
});

export function setOutagePeriod(period: OutagePeriod): void {
  outagePeriodStore.setState(() => ({ period }));
}
