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

function atDayOffset(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

export async function seedPlanner() {
  if ((await db.tasks.count()) > 0 || (await db.notes.count()) > 0) return;

  const now = new Date().toISOString();
  const today = atDayOffset(0);
  const tomorrow = atDayOffset(1);

  await db.transaction("rw", db.tasks, db.notes, db.history, async () => {
    await db.tasks.bulkAdd([
      {
        id: crypto.randomUUID(),
        title: "Hoàn thiện đề cương Database Security",
        description: "Rà soát phần phân quyền và chuẩn bị câu hỏi ôn tập.",
        dueDate: today,
        startTime: "09:00",
        endTime: "10:30",
        priority: "high",
        status: "in_progress",
        progress: 60,
        category: "Học tập",
        tags: ["ôn thi", "database"],
        checklist: [
          { id: crypto.randomUUID(), label: "Ôn chương 1", done: true },
          { id: crypto.randomUUID(), label: "Ôn chương 2", done: true },
          { id: crypto.randomUUID(), label: "Làm đề cũ", done: false },
        ],
        reminderMinutes: 30,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      },
      {
        id: crypto.randomUUID(),
        title: "Tập thể dục",
        description: "Chạy nhẹ và giãn cơ.",
        dueDate: today,
        startTime: "18:00",
        endTime: "19:00",
        priority: "medium",
        status: "not_started",
        progress: 0,
        category: "Sức khỏe",
        tags: ["sức khỏe"],
        checklist: [],
        reminderMinutes: 15,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      },
      {
        id: crypto.randomUUID(),
        title: "Nộp bài Business Law",
        description: "Kiểm tra định dạng và nộp bản PDF.",
        dueDate: tomorrow,
        startTime: "08:00",
        endTime: "08:30",
        priority: "urgent",
        status: "not_started",
        progress: 20,
        category: "Học tập",
        tags: ["deadline"],
        checklist: [],
        reminderMinutes: 60,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      },
    ]);

    await db.notes.add({
      id: crypto.randomUUID(),
      title: "Mục tiêu tuần này",
      content:
        "Hoàn thành đề cương trước thứ Tư, duy trì 4 phiên Pomodoro mỗi ngày và ngủ trước 23:30.",
      category: "Mục tiêu",
      tags: ["tuần này"],
      isPinned: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await db.history.add({
      entityType: "settings",
      entityId: "database",
      action: "Khởi tạo",
      detail: "Đã tạo dữ liệu mẫu trên thiết bị.",
      createdAt: now,
    });
  });
}
