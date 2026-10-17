export type OutagePeriod = "today" | "this_week" | "last_week";

export type OutageKind = "unscheduled" | "scheduled";

export type OutageStatus =
  | { kind: "unscheduled"; state: "ongoing" | "restored" }
  | { kind: "scheduled"; state: "scheduled" | "cancelled" };

export interface Outage {
  id: number;
  kind: OutageKind;
  feeder: string;
  area: string;
  status: OutageStatus;
  consumers: number | null;
  purpose: string;
  schedule: string;
}

export interface OutageFeed {
  unscheduled: Outage[];
  scheduled: Outage[];
}
