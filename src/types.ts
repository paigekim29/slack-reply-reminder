export type PendingReminder = {
  id: string;
  channel: string;
  messageTs: string;
  threadTs: string;
  authorId: string;
  targetUserId: string;
  text: string;
  permalink?: string;
  createdAt: string;
  dueAt: string;
  reminderCount: number;
  resolvedAt?: string;
  resolution?: "replied" | "done" | "not-needed";
};

export type WorkSchedule = {
  start: string;
  end: string;
};
