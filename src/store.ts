import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PendingReminder } from "./types.js";

export class ReminderStore {
  private reminders = new Map<string, PendingReminder>();
  private disabledUserIds = new Set<string>();
  private writeQueue = Promise.resolve();

  constructor(private readonly filename: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filename, "utf8");
      const parsed = JSON.parse(raw) as
        | PendingReminder[]
        | { reminders: PendingReminder[]; disabledUserIds?: string[] };
      const items = Array.isArray(parsed) ? parsed : parsed.reminders;
      this.reminders = new Map(
        items
          .filter((item) => item.targetUserId)
          .map((item) => [item.id, item]),
      );
      this.disabledUserIds = new Set(
        Array.isArray(parsed) ? [] : (parsed.disabledUserIds ?? []),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  get(id: string): PendingReminder | undefined {
    return this.reminders.get(id);
  }

  active(): PendingReminder[] {
    return [...this.reminders.values()].filter((item) => !item.resolvedAt);
  }

  activeForUser(userId: string): PendingReminder[] {
    return this.active().filter((item) => item.targetUserId === userId);
  }

  isUserEnabled(userId: string): boolean {
    return !this.disabledUserIds.has(userId);
  }

  async setUserEnabled(userId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      this.disabledUserIds.delete(userId);
    } else {
      this.disabledUserIds.add(userId);
      for (const reminder of this.activeForUser(userId)) {
        reminder.resolvedAt = new Date().toISOString();
        reminder.resolution = "disabled";
      }
    }
    await this.persist();
  }

  findByMessage(
    channel: string,
    messageTs: string,
    targetUserId: string,
  ): PendingReminder | undefined {
    return this.active().find(
      (item) =>
        item.channel === channel &&
        item.messageTs === messageTs &&
        item.targetUserId === targetUserId,
    );
  }

  findByThread(
    channel: string,
    threadTs: string,
    targetUserId: string,
  ): PendingReminder[] {
    return this.active().filter(
      (item) =>
        item.channel === channel &&
        item.threadTs === threadTs &&
        item.targetUserId === targetUserId,
    );
  }

  async set(reminder: PendingReminder): Promise<void> {
    this.reminders.set(reminder.id, reminder);
    await this.persist();
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filename), { recursive: true });
      const temporary = `${this.filename}.tmp`;
      await writeFile(
        temporary,
        `${JSON.stringify(
          {
            reminders: [...this.reminders.values()],
            disabledUserIds: [...this.disabledUserIds],
          },
          null,
          2,
        )}\n`,
      );
      await rename(temporary, this.filename);
    });
    await this.writeQueue;
  }
}
