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
  latest_update: string | null;
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
  unscheduled?: UnscheduledOutage[];
  scheduled?: ScheduledOutage[];
}
