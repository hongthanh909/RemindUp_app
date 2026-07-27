import Dexie, { type EntityTable } from "dexie";

export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled"
  | "overdue";

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

export type RepeatFrequency = "none" | "daily" | "weekly" | "monthly" | "yearly";

export type RepeatRule = {
  frequency: RepeatFrequency;
  interval: number;
  weekdays: number[];
  endType: "never" | "date" | "count";
  endDate: string | null;
  count: number | null;
};

export type PlannerTask = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  startTime: string;
  endTime: string;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  category: string;
  tags: string[];
  checklist: ChecklistItem[];
  reminderMinutes: number | null;
  timezone?: string;
  repeatRule?: RepeatRule;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type PlannerNote = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isPinned: boolean;
  imageData?: string;
  thumbnailData?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type HistoryEntry = {
  id?: number;
  entityType: "task" | "note" | "settings";
  entityId: string;
  action: string;
  detail: string;
  createdAt: string;
};

export type PlannerSetting = {
  key: string;
  value: string | number | boolean;
};

export class PlannerDatabase extends Dexie {
  tasks!: EntityTable<PlannerTask, "id">;
  notes!: EntityTable<PlannerNote, "id">;
  history!: EntityTable<HistoryEntry, "id">;
  settings!: EntityTable<PlannerSetting, "key">;

  constructor() {
    super("remindup-planner");
    this.version(1).stores({
      tasks: "&id,dueDate,status,priority,updatedAt,*tags",
      notes: "&id,isPinned,updatedAt,deletedAt,*tags",
      history: "++id,entityType,entityId,createdAt",
      settings: "&key",
    });
  }
}

export const db = new PlannerDatabase();

const pad = (value: number) => String(value).padStart(2, "0");

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const legacyDemoTasks = [
  { title: "Hoàn thiện đề cương Database Security", description: "Rà soát phần phân quyền và chuẩn bị câu hỏi ôn tập." },
  { title: "Tập thể dục", description: "Chạy nhẹ và giãn cơ." },
  { title: "Nộp bài Business Law", description: "Kiểm tra định dạng và nộp bản PDF." },
];

const legacyDemoNotes = [
  {
    title: "Mục tiêu tuần này",
    content: "Hoàn thành đề cương trước thứ Tư, duy trì 4 phiên Pomodoro mỗi ngày và ngủ trước 23:30.",
  },
];

export async function initializePlanner() {
  const cleanupKey = "legacy-demo-cleaned-v1";
  if (await db.settings.get(cleanupKey)) return;

  await db.transaction("rw", db.tasks, db.notes, db.history, db.settings, async () => {
    const [tasks, notes] = await Promise.all([db.tasks.toArray(), db.notes.toArray()]);
    const taskIds = tasks
      .filter((task) => legacyDemoTasks.some((demo) => demo.title === task.title && demo.description === task.description))
      .map((task) => task.id);
    const noteIds = notes
      .filter((note) => legacyDemoNotes.some((demo) => demo.title === note.title && demo.content === note.content))
      .map((note) => note.id);

    if (taskIds.length) await db.tasks.bulkDelete(taskIds);
    if (noteIds.length) await db.notes.bulkDelete(noteIds);

    await db.settings.put({ key: cleanupKey, value: true });
  });
}
