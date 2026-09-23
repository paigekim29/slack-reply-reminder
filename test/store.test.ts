import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReminderStore } from "../src/store.js";
import type { PendingReminder } from "../src/types.js";

const reminder: PendingReminder = {
  id: "C1:1.0:U1",
  channel: "C1",
  messageTs: "1.0",
  threadTs: "1.0",
  authorId: "U2",
  targetUserId: "U1",
  text: "<@U1> hello",
  createdAt: "2026-09-23T00:00:00.000Z",
  dueAt: "2026-09-23T00:01:00.000Z",
  reminderCount: 0,
};

test("persists disabled users and cancels their pending reminders", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cookie-nudge-"));
  const filename = join(directory, "reminders.json");

  try {
    const store = new ReminderStore(filename);
    await store.load();
    await store.set({ ...reminder });
    await store.setUserEnabled("U1", false);

    assert.equal(store.isUserEnabled("U1"), false);
    assert.equal(store.activeForUser("U1").length, 0);

    const reloaded = new ReminderStore(filename);
    await reloaded.load();
    assert.equal(reloaded.isUserEnabled("U1"), false);

    await reloaded.setUserEnabled("U1", true);
    assert.equal(reloaded.isUserEnabled("U1"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("loads the previous array-only storage format", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cookie-nudge-"));
  const filename = join(directory, "reminders.json");

  try {
    await writeFile(filename, JSON.stringify([reminder]));
    const store = new ReminderStore(filename);
    await store.load();

    assert.equal(store.activeForUser("U1").length, 1);
    assert.equal(store.isUserEnabled("U1"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
