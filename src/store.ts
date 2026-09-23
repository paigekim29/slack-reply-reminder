import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PendingReminder } from "./types.js";

export class ReminderStore {
  private reminders = new Map<string, PendingReminder>();
  private writeQueue = Promise.resolve();

  constructor(private readonly filename: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filename, "utf8");
      const items = JSON.parse(raw) as PendingReminder[];
      this.reminders = new Map(items.map((item) => [item.id, item]));
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

  findByMessage(channel: string, messageTs: string): PendingReminder | undefined {
    return this.active().find(
      (item) => item.channel === channel && item.messageTs === messageTs,
    );
  }

  findByThread(channel: string, threadTs: string): PendingReminder[] {
    return this.active().filter(
      (item) => item.channel === channel && item.threadTs === threadTs,
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
        `${JSON.stringify([...this.reminders.values()], null, 2)}\n`,
      );
      await rename(temporary, this.filename);
    });
    await this.writeQueue;
  }
}
