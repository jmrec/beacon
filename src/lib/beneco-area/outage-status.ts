import type { OutageStatus } from "./types/internal.ts";

export type StatusKey = OutageStatus["state"];

export const STATUS_ORDER: StatusKey[] = [
  "ongoing",
  "scheduled",
  "cancelled",
  "restored",
];

export const STATUS_LABEL: Record<StatusKey, string> = {
  ongoing: "Ongoing",
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  restored: "Restored",
};

export const STATUS_TONE: Record<StatusKey, string> = {
  ongoing: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  cancelled: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  restored: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function statusKey(status: OutageStatus): StatusKey {
  return status.state;
}
