import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import { isWorkingTime, nextWorkingTime } from "../src/schedule.js";

const seoul = { start: "07:00", end: "16:00" };

test("keeps a Seoul weekday instant inside working hours", () => {
  const instant = DateTime.fromISO("2026-09-23T08:30:00", { zone: "Asia/Seoul" });
  assert.equal(nextWorkingTime(instant, "Asia/Seoul", seoul).toISO(), instant.toISO());
  assert.equal(isWorkingTime(instant, "Asia/Seoul", seoul), true);
});

test("moves an evening instant to the next weekday at 07:00", () => {
  const instant = DateTime.fromISO("2026-09-25T18:00:00", { zone: "Asia/Seoul" });
  const next = nextWorkingTime(instant, "Asia/Seoul", seoul);
  assert.equal(next.toFormat("yyyy-MM-dd HH:mm"), "2026-09-28 07:00");
});

test("uses America daylight-saving offsets through IANA timezone", () => {
  const schedule = { start: "09:00", end: "18:00" };
  const fridayNight = DateTime.fromISO("2026-03-06T20:00:00", {
    zone: "America/Los_Angeles",
  });
  const next = nextWorkingTime(fridayNight, "America/Los_Angeles", schedule);
  assert.equal(next.toFormat("yyyy-MM-dd HH:mm ZZZZ"), "2026-03-09 09:00 PDT");
});
