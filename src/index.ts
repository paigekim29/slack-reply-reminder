import "dotenv/config";
import { App, LogLevel } from "@slack/bolt";
import { DateTime } from "luxon";
import { nextWorkingTime, scheduleFor, loadSchedules, isWorkingTime } from "./schedule.js";
import { ReminderStore } from "./store.js";
import type { PendingReminder } from "./types.js";

const required = [
  "SLACK_BOT_TOKEN",
  "SLACK_APP_TOKEN",
  "SLACK_SIGNING_SECRET",
] as const;

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const initialDelay = positiveNumber("INITIAL_DELAY_MINUTES", 20);
const repeatDelay = positiveNumber("REPEAT_DELAY_MINUTES", 60);
const maxReminders = positiveNumber("MAX_REMINDERS", 3);
const schedules = loadSchedules(process.env.WORK_SCHEDULES_JSON);
const store = new ReminderStore(process.env.DATA_FILE ?? "./data/reminders.json");
const timezoneOverrides = new Map<string, string>();
const timezoneCache = new Map<string, { value: string; expiresAt: number }>();
let schedulerRunning = false;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  logLevel: process.env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG,
});

type SlackMessage = {
  type: "message";
  subtype?: string;
  channel: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
};

app.message(async ({ message, client, logger }) => {
  const event = message as SlackMessage;
  if (event.subtype || event.bot_id || !event.user || !event.text) return;

  if (event.thread_ts) {
    for (const reminder of store.findByThread(
      event.channel,
      event.thread_ts,
      event.user,
    )) {
      await resolve(reminder, "replied");
      logger.info(`Resolved ${reminder.id}: reply detected`);
    }
  }

  const mentionedUserIds = [
    ...new Set(
      [...event.text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)]
        .map((match) => match[1])
        .filter((userId) => userId !== event.user),
    ),
  ];
  if (mentionedUserIds.length === 0) return;

  const now = DateTime.utc();
  let permalink: string | undefined;

  try {
    const result = await client.chat.getPermalink({
      channel: event.channel,
      message_ts: event.ts,
    });
    permalink = result.permalink;
  } catch (error) {
    logger.warn("Could not obtain message permalink", error);
  }

  for (const targetUserId of mentionedUserIds) {
    if (!store.isUserEnabled(targetUserId)) continue;
    if (store.findByMessage(event.channel, event.ts, targetUserId)) continue;

    try {
      const target = await client.users.info({ user: targetUserId });
      if (target.user?.is_bot || target.user?.deleted) continue;
    } catch (error) {
      logger.warn(`Could not inspect mentioned user ${targetUserId}`, error);
      continue;
    }

    const zone = await getTimezone(client, targetUserId);
    const due = nextWorkingTime(
      now.plus({ minutes: initialDelay }),
      zone,
      scheduleFor(zone, schedules),
    );
    const id = `${event.channel}:${event.ts}:${targetUserId}`;

    await store.set({
      id,
      channel: event.channel,
      messageTs: event.ts,
      threadTs: event.thread_ts ?? event.ts,
      authorId: event.user,
      targetUserId,
      text: event.text,
      permalink,
      createdAt: now.toISO()!,
      dueAt: due.toUTC().toISO()!,
      reminderCount: 0,
    });
    logger.info(`Tracking mention ${id}, due ${due.toISO()}`);
  }
});

app.action("reminder_snooze", async ({ ack, action, respond }) => {
  await ack();
  if (action.type !== "button" || !action.value) return;
  const reminder = store.get(action.value);
  if (!reminder || reminder.resolvedAt) return;
  reminder.dueAt = DateTime.utc().plus({ minutes: 30 }).toISO()!;
  await store.set(reminder);
  await respond({
    replace_original: true,
    text: "I'll remind you again in 30 minutes.",
  });
});

for (const actionId of ["reminder_done", "reminder_not_needed"] as const) {
  app.action(actionId, async ({ ack, action, respond, client, logger }) => {
    await ack();
    if (action.type !== "button" || !action.value) return;
    const reminder = store.get(action.value);
    if (!reminder) return;

    const reaction =
      actionId === "reminder_done" ? "white_check_mark" : "heavy_minus_sign";
    try {
      await client.reactions.add({
        channel: reminder.channel,
        timestamp: reminder.messageTs,
        name: reaction,
      });
    } catch (error) {
      logger.warn(`Could not add ${reaction} reaction to ${reminder.id}`, error);
    }

    await resolve(reminder, actionId === "reminder_done" ? "done" : "not-needed");
    await respond({
      replace_original: true,
      text: actionId === "reminder_done" ? "Marked as done." : "Marked as no reply needed.",
    });
  });
}

app.command("/cookie-nudge", async ({ ack, command, respond, client }) => {
  await ack();
  const [operation, value] = command.text.trim().split(/\s+/, 2);
  const userId = command.user_id;

  if (operation === "disable") {
    await store.setUserEnabled(userId, false);
    await respond("Cookie Nudge reminders are now disabled for you.");
    return;
  }

  if (operation === "enable") {
    await store.setUserEnabled(userId, true);
    await respond("Cookie Nudge reminders are now enabled for you.");
    return;
  }

  if (operation === "timezone" && value) {
    if (value === "auto") {
      timezoneOverrides.delete(userId);
      timezoneCache.delete(userId);
    } else if (DateTime.now().setZone(value).isValid) {
      timezoneOverrides.set(userId, value);
    } else {
      await respond(`That is not a valid IANA timezone: \`${value}\``);
      return;
    }
  } else if (operation && operation !== "status") {
    await respond(
      "Usage: `/cookie-nudge status`, `/cookie-nudge enable`, `/cookie-nudge disable`, or `/cookie-nudge timezone <IANA timezone|auto>`",
    );
    return;
  }

  const zone = await getTimezone(client, userId);
  const schedule = scheduleFor(zone, schedules);
  const pending = store.activeForUser(userId).length;
  const state = store.isUserEnabled(userId) ? "enabled" : "disabled";
  await respond(
    `Reminders: *${state}*\nCurrent timezone: \`${zone}\`\nWorking hours: ${schedule.start}–${schedule.end} (Monday–Friday)\nPending replies: ${pending}`,
  );
});

async function runScheduler(): Promise<void> {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const now = DateTime.utc();

    for (const reminder of store.active()) {
      if (!store.isUserEnabled(reminder.targetUserId)) continue;
      if (reminder.reminderCount >= maxReminders) continue;
      if (DateTime.fromISO(reminder.dueAt) > now) continue;

      const zone = await getTimezone(app.client, reminder.targetUserId);
      const schedule = scheduleFor(zone, schedules);
      if (!isWorkingTime(now, zone, schedule)) {
        reminder.dueAt = nextWorkingTime(now, zone, schedule).toUTC().toISO()!;
        await store.set(reminder);
        continue;
      }

      await app.client.chat.postMessage({
        channel: reminder.targetUserId,
        text: `You haven't replied to <@${reminder.authorId}>'s message yet.`,
        blocks: reminderBlocks(reminder),
      });
      reminder.reminderCount += 1;
      reminder.dueAt = nextWorkingTime(
        now.plus({ minutes: repeatDelay }),
        zone,
        schedule,
      ).toUTC().toISO()!;
      await store.set(reminder);
    }
  } finally {
    schedulerRunning = false;
  }
}

function reminderBlocks(reminder: PendingReminder) {
  const preview = reminder.text.replace(/<@[^>]+>/g, "").trim().slice(0, 240);
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*You haven't replied to <@${reminder.authorId}>'s message yet.*\n>${preview}`,
      },
    },
    {
      type: "actions",
      elements: [
        ...(reminder.permalink
          ? [{ type: "button", text: { type: "plain_text", text: "Open message" }, url: reminder.permalink }]
          : []),
        {
          type: "button",
          action_id: "reminder_snooze",
          text: { type: "plain_text", text: "In 30 minutes" },
          value: reminder.id,
        },
        {
          type: "button",
          action_id: "reminder_done",
          text: { type: "plain_text", text: "Done" },
          style: "primary",
          value: reminder.id,
        },
        {
          type: "button",
          action_id: "reminder_not_needed",
          text: { type: "plain_text", text: "No reply needed" },
          value: reminder.id,
        },
      ],
    },
  ];
}

async function getTimezone(
  client: typeof app.client,
  userId: string,
): Promise<string> {
  const override = timezoneOverrides.get(userId) ?? process.env.TIMEZONE_OVERRIDE;
  if (override) return override;
  const cached = timezoneCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await client.users.info({ user: userId });
  const zone = response.user?.tz ?? "Asia/Seoul";
  timezoneCache.set(userId, {
    value: zone,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return zone;
}

async function resolve(
  reminder: PendingReminder,
  resolution: NonNullable<PendingReminder["resolution"]>,
): Promise<void> {
  reminder.resolvedAt = DateTime.utc().toISO()!;
  reminder.resolution = resolution;
  await store.set(reminder);
}

function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

await store.load();
await app.start();
setInterval(() => void runScheduler(), 30_000);
await runScheduler();
console.log("⚡️ Slack reply reminder is running");
