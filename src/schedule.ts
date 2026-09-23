import { DateTime } from "luxon";
import type { WorkSchedule } from "./types.js";

const DEFAULT_SCHEDULES: Record<string, WorkSchedule> = {
  "Asia/Seoul": { start: "07:00", end: "16:00" },
  "Asia/*": { start: "09:00", end: "18:00" },
  "America/*": { start: "09:00", end: "18:00" },
  default: { start: "09:00", end: "18:00" },
};

export function loadSchedules(raw?: string): Record<string, WorkSchedule> {
  if (!raw) return DEFAULT_SCHEDULES;
  const parsed = JSON.parse(raw) as Record<string, WorkSchedule>;
  if (!parsed.default) parsed.default = DEFAULT_SCHEDULES.default;
  for (const [name, schedule] of Object.entries(parsed)) {
    if (!isClock(schedule.start) || !isClock(schedule.end)) {
      throw new Error(`Invalid work schedule for ${name}`);
    }
  }
  return parsed;
}

export function scheduleFor(
  zone: string,
  schedules: Record<string, WorkSchedule>,
): WorkSchedule {
  if (schedules[zone]) return schedules[zone];
  const region = `${zone.split("/")[0]}/*`;
  return schedules[region] ?? schedules.default;
}

export function nextWorkingTime(
  instant: DateTime,
  zone: string,
  schedule: WorkSchedule,
): DateTime {
  let local = instant.setZone(zone);

  for (let attempts = 0; attempts < 9; attempts += 1) {
    if (local.weekday <= 5) {
      const start = atClock(local, schedule.start);
      const end = atClock(local, schedule.end);
      if (local < start) return start;
      if (local >= start && local < end) return local;
    }
    local = local.plus({ days: 1 }).startOf("day");
  }

  throw new Error("Could not find the next working time");
}

export function isWorkingTime(
  instant: DateTime,
  zone: string,
  schedule: WorkSchedule,
): boolean {
  const local = instant.setZone(zone);
  if (local.weekday > 5) return false;
  return (
    local >= atClock(local, schedule.start) &&
    local < atClock(local, schedule.end)
  );
}

function atClock(day: DateTime, clock: string): DateTime {
  const [hour, minute] = clock.split(":").map(Number);
  return day.startOf("day").set({ hour, minute });
}

function isClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
