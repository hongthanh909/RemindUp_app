"use client";

import {
  AlarmClock,
  ArchiveRestore,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Download,
  FileText,
  Flame,
  Home,
  ImagePlus,
  KeyRound,
  LockKeyhole,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Tag,
  TimerReset,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  db,
  localDateKey,
  type PlannerNote,
  type PlannerTask,
  type Priority,
  type RepeatFrequency,
  initializePlanner,
} from "./db";

type View = "home" | "calendar" | "notes" | "settings";
type Modal = "task" | "note" | "security" | null;
type ClockMode = "countdown" | "stopwatch" | "alarm";

const categories = ["Học tập", "Công việc", "Cá nhân", "Sức khỏe", "Tài chính", "Mục tiêu"];

const priorityLabel: Record<Priority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp",
};

const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const pinStorageKey = "remindup-pin-verifier-v1";
const repeatLabels: Record<RepeatFrequency, string> = {
  none: "Không lặp",
  daily: "Hằng ngày",
  weekly: "Hằng tuần",
  monthly: "Hằng tháng",
  yearly: "Hằng năm",
};

const pad = (value: number) => String(value).padStart(2, "0");

function pressFeedback(pattern: number | number[] = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

async function showSystemNotification(title: string, body: string, tag: string) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator)
  ) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
    });
  } catch {
    // The in-app toast remains the fallback when the platform rejects a notification.
  }
}

function formatTimer(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function dateContextLabel(value: string, today: string) {
  if (value === today) return "Hôm nay";
  const date = new Date(`${value}T00:00:00`);
  const prefix = value < today ? "Đã qua" : "Sắp tới";
  const formatted = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long" }).format(date);
  return `${prefix} / ${formatted}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(window.atob(value), (character) => character.charCodeAt(0));
}

async function derivePinVerifier(pin: string, salt: Uint8Array, iterations = 600_000) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function savePinVerifier(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 600_000;
  const verifier = await derivePinVerifier(pin, salt, iterations);
  window.localStorage.setItem(
    pinStorageKey,
    JSON.stringify({ salt: bytesToBase64(salt), verifier, iterations }),
  );
}

async function verifyPin(pin: string) {
  const stored = window.localStorage.getItem(pinStorageKey);
  if (!stored) return true;
  try {
    const record = JSON.parse(stored) as { salt: string; verifier: string; iterations: number };
    const actual = await derivePinVerifier(pin, base64ToBytes(record.salt), record.iterations);
    return actual === record.verifier;
  } catch {
    return false;
  }
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short" }).format(date);
}

function parseMinutes(value: string) {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function greetingFor(hour: number) {
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function countdownTo(task: PlannerTask, now: Date) {
  const target = new Date(`${task.dueDate}T${task.startTime || "23:59"}:00`);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "Đã đến giờ";
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `Còn ${days} ngày ${hours} giờ`;
  if (hours > 0) return `Còn ${hours} giờ ${minutes % 60} phút`;
  return `Còn ${Math.max(1, minutes)} phút`;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<{ dataUrl: string; size: number }>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Không thể xử lý ảnh."));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Không thể đọc ảnh đã xử lý."));
        reader.onload = () => resolve({ dataUrl: String(reader.result), size: blob.size });
        reader.readAsDataURL(blob);
      },
      "image/webp",
      quality,
    );
  });
}

async function optimizeImage(file: File) {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Ảnh cần nhỏ hơn 15 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Định dạng ảnh chưa được hỗ trợ."));
      element.src = objectUrl;
    });

    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);

    let quality = 0.78;
    let optimized = await canvasToDataUrl(canvas, quality);
    while (optimized.size > 1.5 * 1024 * 1024 && quality > 0.5) {
      quality -= 0.08;
      optimized = await canvasToDataUrl(canvas, quality);
    }

    const thumbnailScale = Math.min(1, 384 / Math.max(width, height));
    const thumbnail = document.createElement("canvas");
    thumbnail.width = Math.max(1, Math.round(width * thumbnailScale));
    thumbnail.height = Math.max(1, Math.round(height * thumbnailScale));
    thumbnail
      .getContext("2d")
      ?.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);

    return {
      imageData: optimized.dataUrl,
      thumbnailData: (await canvasToDataUrl(thumbnail, 0.65)).dataUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createWeek(anchor: Date) {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - 3);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function EmptyState({ icon: Icon, title, copy, action }: {
  icon: typeof FileText;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={24} /></span>
      <h3>{title}</h3>
      <p>{copy}</p>
      {action}
    </div>
  );
}

export default function PlannerApp() {
  const now = useClock();
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [notes, setNotes] = useState<PlannerNote[]>([]);
  const [view, setView] = useState<View>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [taskDraftDate, setTaskDraftDate] = useState(localDateKey());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem("remindup-theme");
    return saved === "dark";
  });
  const [clock24, setClock24] = useState(() =>
    typeof window === "undefined" ? true : window.localStorage.getItem("remindup-clock24") !== "false",
  );
  const [showSeconds, setShowSeconds] = useState(() =>
    typeof window === "undefined" ? true : window.localStorage.getItem("remindup-seconds") !== "false",
  );
  const [pinConfigured, setPinConfigured] = useState(() =>
    typeof window === "undefined" ? false : Boolean(window.localStorage.getItem(pinStorageKey)),
  );
  const [locked, setLocked] = useState(() =>
    typeof window === "undefined" ? false : Boolean(window.localStorage.getItem(pinStorageKey)),
  );
  const importRef = useRef<HTMLInputElement>(null);

  const showFeedback = useCallback((message: string) => {
    setToast(message);
    pressFeedback();
  }, []);

  const refresh = useCallback(async () => {
    const [taskRows, noteRows] = await Promise.all([
      db.tasks.orderBy("updatedAt").reverse().toArray(),
      db.notes.orderBy("updatedAt").reverse().toArray(),
    ]);
    const activeNotes = noteRows.filter((note) => !note.deletedAt);
    setTasks(taskRows);
    setNotes(activeNotes);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      await initializePlanner();
      const overdue = await db.tasks
        .filter(
          (task) =>
            task.status !== "completed" &&
            task.status !== "cancelled" &&
            task.dueDate < localDateKey(),
        )
        .toArray();
      await Promise.all(
        overdue.map((task) => db.tasks.update(task.id, { status: "overdue", updatedAt: new Date().toISOString() })),
      );
      await refresh();
      setLoading(false);
    };
    void initialize();

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
  }, [refresh]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.localStorage.setItem("remindup-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const checkTaskReminders = () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const timestamp = Date.now();

      tasks.forEach((task) => {
        if (
          task.status === "completed" ||
          task.status === "cancelled" ||
          task.reminderMinutes === null
        ) return;

        const startAt = new Date(`${task.dueDate}T${task.startTime}:00`).getTime();
        const reminderAt = startAt - task.reminderMinutes * 60_000;
        const reminderKey = `remindup-reminder-${task.id}-${startAt}`;
        if (
          timestamp >= reminderAt &&
          timestamp < startAt + 60_000 &&
          !window.localStorage.getItem(reminderKey)
        ) {
          window.localStorage.setItem(reminderKey, "sent");
          void showSystemNotification(
            task.title,
            `Bắt đầu lúc ${task.startTime} / ${task.category}`,
            `task-${task.id}`,
          );
          showFeedback(`Sắp đến giờ: ${task.title}`);
        }
      });
    };

    checkTaskReminders();
    const timer = window.setInterval(checkTaskReminders, 30_000);
    return () => window.clearInterval(timer);
  }, [showFeedback, tasks]);

  useEffect(() => {
    if (!pinConfigured || locked) return;
    let timer = window.setTimeout(() => setLocked(true), 5 * 60 * 1000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLocked(true), 5 * 60 * 1000);
    };
    const lockWhenHidden = () => {
      if (document.visibilityState === "hidden") setLocked(true);
    };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    document.addEventListener("visibilitychange", lockWhenHidden);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      document.removeEventListener("visibilitychange", lockWhenHidden);
    };
  }, [locked, pinConfigured]);

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    if (!normalized) return tasks;
    return tasks.filter((task) =>
      [task.title, task.description, task.category, ...task.tags]
        .join(" ")
        .toLocaleLowerCase("vi")
        .includes(normalized),
    );
  }, [tasks, query]);

  const today = localDateKey(now);
  const selectedTasks = filteredTasks
    .filter((task) => task.dueDate === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const completedSelected = selectedTasks.filter((task) => task.status === "completed").length;
  const overdueCount = tasks.filter((task) => task.status === "overdue").length;
  const completion = selectedTasks.length ? Math.round((completedSelected / selectedTasks.length) * 100) : 0;
  const nextTask = [...tasks]
    .filter((task) => task.status !== "completed" && task.status !== "cancelled")
    .sort((a, b) => `${a.dueDate}${a.startTime}`.localeCompare(`${b.dueDate}${b.startTime}`))
    .find((task) => new Date(`${task.dueDate}T${task.startTime || "23:59"}:00`) >= now);

  const timeText = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: showSeconds ? "2-digit" : undefined,
    hour12: !clock24,
  }).format(now);

  const navigate = (nextView: View) => {
    if (nextView === "home") setSelectedDate(today);
    setView(nextView);
  };

  const toggleTask = async (task: PlannerTask) => {
    const complete = task.status !== "completed";
    const timestamp = new Date().toISOString();
    await db.tasks.update(task.id, {
      status: complete ? "completed" : "in_progress",
      progress: complete ? 100 : Math.min(task.progress, 80),
      completedAt: complete ? timestamp : null,
      updatedAt: timestamp,
    });
    await db.history.add({
      entityType: "task",
      entityId: task.id,
      action: complete ? "Hoàn thành" : "Mở lại",
      detail: task.title,
      createdAt: timestamp,
    });
    await refresh();
    showFeedback(complete ? "Đã hoàn thành công việc" : "Đã mở lại công việc");
  };

  const openTask = (task?: PlannerTask, dueDate = selectedDate) => {
    if (!task && dueDate < localDateKey()) {
      showFeedback("Thời gian này đã cũ. Hãy chọn hôm nay hoặc một ngày trong tương lai");
      return;
    }
    setEditingTask(task ?? null);
    setTaskDraftDate(task?.dueDate ?? dueDate);
    setModal("task");
  };

  const exportData = async () => {
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      timezone: "Asia/Ho_Chi_Minh",
      tasks: await db.tasks.toArray(),
      notes: await db.notes.toArray(),
      history: await db.history.toArray(),
    };
    const checksum = bytesToBase64(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(backup)))),
    );
    const payload = { ...backup, checksum };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `remindup-backup-${localDateKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showFeedback("Đã tạo bản sao lưu JSON");
  };

  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        version?: number;
        exportedAt?: string;
        timezone?: string;
        tasks?: PlannerTask[];
        notes?: PlannerNote[];
        history?: unknown[];
        checksum?: string;
      };
      if (![1, 2].includes(parsed.version ?? 0) || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.notes)) {
        throw new Error("invalid");
      }
      if (parsed.version === 2) {
        const { checksum, ...backup } = parsed;
        const actual = bytesToBase64(
          new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(backup)))),
        );
        if (!checksum || actual !== checksum) throw new Error("checksum");
      }
      await db.transaction("rw", db.tasks, db.notes, async () => {
        await db.tasks.bulkPut(parsed.tasks ?? []);
        await db.notes.bulkPut(parsed.notes ?? []);
      });
      await refresh();
      showFeedback("Khôi phục dữ liệu thành công");
    } catch {
      showFeedback("Tệp sao lưu không hợp lệ");
    }
  };

  const requestStorage = async () => {
    const granted = await navigator.storage?.persist?.();
    showFeedback(granted ? "Đã ưu tiên bảo vệ dữ liệu trên thiết bị" : "Trình duyệt chưa cấp lưu trữ bền vững");
  };

  const requestNotifications = async () => {
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (isIos && !standalone) {
      showFeedback("Trên iPhone, hãy Thêm vào Màn hình chính rồi bật thông báo trong app");
      return;
    }
    if (!("Notification" in window)) {
      showFeedback("Trình duyệt này chưa hỗ trợ thông báo");
      return;
    }
    const result = await Notification.requestPermission();
    showFeedback(result === "granted" ? "Đã bật thông báo trong ứng dụng" : "Quyền thông báo chưa được bật");
  };

  if (loading) {
    return (
      <main className="app-loading" role="status">
        <span className="brand-mark"><Sparkles size={22} /></span>
        <p>Đang mở không gian của bạn…</p>
      </main>
    );
  }

  if (locked) {
    return <LockScreen unlock={() => setLocked(false)} />;
  }

  return (
    <div className="app-shell">
      <aside className="desktop-rail" aria-label="Điều hướng chính">
        <div className="rail-brand"><span className="brand-mark"><Sparkles size={19} /></span><strong>RemindUp</strong></div>
        <Navigation view={view} setView={navigate} openTask={() => openTask()} desktop />
        <div className="rail-foot">
          <span className="avatar">TH</span>
          <div><strong>Không gian cá nhân</strong><small>Local-first</small></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark"><Sparkles size={18} /></span>
            <strong>RemindUp</strong>
          </div>
          <label className="search-field">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm công việc, ghi chú…"
              aria-label="Tìm kiếm toàn hệ thống"
            />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={16} /></button>}
          </label>
          <div className="top-actions">
            <button className="icon-button" type="button" onClick={requestNotifications} aria-label="Bật thông báo"><Bell size={19} /></button>
            <span className="avatar">TH</span>
          </div>
        </header>

        <div className="content-wrap">
          {view === "home" && (
            <Dashboard
              now={now}
              timeText={timeText}
              selectedDate={selectedDate}
              selectedTasks={selectedTasks}
              nextTask={nextTask}
              completion={completion}
              completedSelected={completedSelected}
              overdueCount={overdueCount}
              notes={notes}
              toggleTask={toggleTask}
              openTask={openTask}
              openNote={() => setModal("note")}
              setView={navigate}
              selectDate={(value) => {
                setSelectedDate(value);
                if (value < today) showFeedback("Ngày này đã qua. Bạn có thể xem lại nhưng không thể thêm lịch mới");
                else showFeedback(value === today ? "Đã trở về hôm nay" : `Đã chọn ${formatShortDate(value)}`);
              }}
              showFeedback={showFeedback}
            />
          )}
          {view === "calendar" && (
            <CalendarView
              tasks={filteredTasks}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              toggleTask={toggleTask}
              openTask={(task) => openTask(task, selectedDate)}
              setToast={showFeedback}
            />
          )}
          {view === "notes" && (
            <NotesView
              notes={notes}
              query={query}
              openNote={() => setModal("note")}
              refresh={refresh}
              setToast={showFeedback}
            />
          )}
          {view === "settings" && (
            <SettingsView
              dark={dark}
              setDark={(value) => {
                setDark(value);
                showFeedback(value ? "Đã bật chế độ tối" : "Đã bật chế độ sáng");
              }}
              clock24={clock24}
              setClock24={(value) => {
                setClock24(value);
                window.localStorage.setItem("remindup-clock24", String(value));
                showFeedback(value ? "Đã dùng định dạng 24 giờ" : "Đã dùng định dạng 12 giờ");
              }}
              showSeconds={showSeconds}
              setShowSeconds={(value) => {
                setShowSeconds(value);
                window.localStorage.setItem("remindup-seconds", String(value));
                showFeedback(value ? "Đã hiển thị giây" : "Đã ẩn giây");
              }}
              exportData={exportData}
              importRef={importRef}
              importData={importData}
              requestStorage={requestStorage}
              requestNotifications={requestNotifications}
              pinConfigured={pinConfigured}
              configurePin={() => setModal("security")}
              lockNow={() => setLocked(true)}
            />
          )}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Điều hướng chính">
        <Navigation view={view} setView={navigate} openTask={() => openTask()} />
      </nav>

      {modal === "task" && (
        <TaskModal
          task={editingTask}
          tasks={tasks}
          initialDate={taskDraftDate}
          close={() => {
            setModal(null);
            setEditingTask(null);
          }}
          saved={async (message) => {
            await refresh();
            setModal(null);
            setEditingTask(null);
            showFeedback(message);
          }}
        />
      )}
      {modal === "note" && (
        <NoteModal
          close={() => setModal(null)}
          saved={async () => {
            await refresh();
            setModal(null);
            showFeedback("Đã lưu ghi chú");
          }}
        />
      )}
      {modal === "security" && (
        <PinModal
          configured={pinConfigured}
          close={() => setModal(null)}
          saved={() => {
            setPinConfigured(true);
            setLocked(false);
            setModal(null);
            showFeedback("Đã bật khóa PIN 6 số");
          }}
          removed={() => {
            setPinConfigured(false);
            setLocked(false);
            setModal(null);
            showFeedback("Đã tắt khóa PIN");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={17} />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast("")} aria-label="Đóng thông báo"><X size={16} /></button>
          <i />
        </div>
      )}
    </div>
  );
}

function Navigation({ view, setView, openTask, desktop = false }: {
  view: View;
  setView: (view: View) => void;
  openTask: () => void;
  desktop?: boolean;
}) {
  const items: Array<{ id: View; label: string; icon: typeof Home }> = [
    { id: "home", label: "Hôm nay", icon: Home },
    { id: "calendar", label: "Lịch", icon: CalendarDays },
    { id: "notes", label: "Ghi chú", icon: FileText },
    { id: "settings", label: "Cài đặt", icon: Settings },
  ];
  if (desktop) {
    return (
      <div className="rail-nav">
        {items.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
        <button type="button" className="rail-create" onClick={openTask}><Plus size={19} /><span>Tạo mới</span></button>
      </div>
    );
  }
  return (
    <>
      {items.slice(0, 2).map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}>
          <Icon size={21} /><span>{label}</span>
        </button>
      ))}
      <button className="nav-create" type="button" onClick={openTask} aria-label="Tạo công việc"><Plus size={25} /></button>
      {items.slice(2).map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}>
          <Icon size={21} /><span>{label}</span>
        </button>
      ))}
    </>
  );
}

function ClockCard({ onFeedback }: { onFeedback: (message: string) => void }) {
  const [mode, setMode] = useState<ClockMode>("countdown");
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [targetAt, setTargetAt] = useState(0);
  const [stopwatchBase, setStopwatchBase] = useState(0);
  const [durationHours, setDurationHours] = useState("0");
  const [durationMinutes, setDurationMinutes] = useState("25");
  const [durationSeconds, setDurationSeconds] = useState("0");
  const [alarmTime, setAlarmTime] = useState("09:00");
  const completedRef = useRef(false);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setRunning(false);
    setSeconds(0);
    pressFeedback([180, 100, 180]);
    const alarm = mode === "alarm";
    const message = alarm ? "Báo thức đã đến giờ" : "Đếm ngược đã hoàn thành";
    onFeedback(message);
    void showSystemNotification(
      alarm ? "RemindUp báo thức" : "RemindUp hẹn giờ",
      alarm ? `Đã đến ${alarmTime}` : "Bộ đếm ngược đã kết thúc",
      `clock-${mode}`,
    );
  }, [alarmTime, mode, onFeedback]);

  useEffect(() => {
    if (!running || !targetAt) return;

    const update = () => {
      if (mode === "stopwatch") {
        setSeconds(stopwatchBase + Math.floor((Date.now() - targetAt) / 1000));
        return;
      }
      const remaining = Math.max(0, Math.ceil((targetAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) complete();
    };

    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [complete, mode, running, stopwatchBase, targetAt]);

  const changeMode = (nextMode: ClockMode) => {
    setRunning(false);
    setTargetAt(0);
    completedRef.current = false;
    setMode(nextMode);
    setSeconds(nextMode === "countdown" ? 25 * 60 : 0);
    setStopwatchBase(0);
    pressFeedback();
    onFeedback(
      nextMode === "countdown" ? "Đã mở bộ đếm ngược" :
      nextMode === "stopwatch" ? "Đã mở đồng hồ bấm giờ" :
      "Đã mở báo thức",
    );
  };

  const applyDuration = () => {
    const total =
      Math.min(99, Math.max(0, Number(durationHours) || 0)) * 3600 +
      Math.min(59, Math.max(0, Number(durationMinutes) || 0)) * 60 +
      Math.min(59, Math.max(0, Number(durationSeconds) || 0));
    if (total <= 0) {
      onFeedback("Hãy đặt thời lượng lớn hơn 0 giây");
      return;
    }
    setRunning(false);
    setTargetAt(0);
    setSeconds(total);
    completedRef.current = false;
    onFeedback(`Đã đặt hẹn giờ ${formatTimer(total)}`);
  };

  const startOrPause = () => {
    if (running) {
      setRunning(false);
      setTargetAt(0);
      if (mode === "stopwatch") setStopwatchBase(seconds);
      onFeedback(mode === "alarm" ? "Đã tạm dừng báo thức" : "Đã tạm dừng đồng hồ");
      return;
    }

    completedRef.current = false;
    if (mode === "alarm") {
      const [hours, minutes] = alarmTime.split(":").map(Number);
      const alarmDate = new Date();
      alarmDate.setHours(hours, minutes, 0, 0);
      if (alarmDate.getTime() <= Date.now()) alarmDate.setDate(alarmDate.getDate() + 1);
      setTargetAt(alarmDate.getTime());
      setSeconds(Math.ceil((alarmDate.getTime() - Date.now()) / 1000));
      setRunning(true);
      onFeedback(`Đã đặt báo thức lúc ${alarmTime}`);
      return;
    }

    if (mode === "countdown" && seconds <= 0) {
      onFeedback("Hãy đặt lại thời lượng trước khi bắt đầu");
      return;
    }
    setTargetAt(mode === "countdown" ? Date.now() + seconds * 1000 : Date.now());
    if (mode === "stopwatch") setStopwatchBase(seconds);
    setRunning(true);
    onFeedback(mode === "stopwatch" ? "Đồng hồ bấm giờ đã chạy" : "Bộ đếm ngược đã bắt đầu");
  };

  const reset = () => {
    setRunning(false);
    setTargetAt(0);
    completedRef.current = false;
    const initial =
      Math.min(99, Math.max(0, Number(durationHours) || 0)) * 3600 +
      Math.min(59, Math.max(0, Number(durationMinutes) || 0)) * 60 +
      Math.min(59, Math.max(0, Number(durationSeconds) || 0));
    setSeconds(mode === "countdown" ? initial || 25 * 60 : 0);
    setStopwatchBase(0);
    onFeedback("Đã đặt lại đồng hồ");
  };

  const visibleTime = mode === "alarm" && !running ? alarmTime : formatTimer(seconds);

  return (
    <section className="timer-card">
      <div className="card-mini-heading">
        <span><TimerReset size={18} /> Trung tâm đồng hồ</span>
        {running && <span className="live-indicator"><i /> Đang chạy</span>}
      </div>
      <div className="timer-tabs" role="tablist" aria-label="Chế độ đồng hồ">
        <button type="button" role="tab" aria-selected={mode === "countdown"} className={mode === "countdown" ? "active" : ""} onClick={() => changeMode("countdown")}><TimerReset size={15} /> Đếm ngược</button>
        <button type="button" role="tab" aria-selected={mode === "stopwatch"} className={mode === "stopwatch" ? "active" : ""} onClick={() => changeMode("stopwatch")}><Clock3 size={15} /> Đếm tới</button>
        <button type="button" role="tab" aria-selected={mode === "alarm"} className={mode === "alarm" ? "active" : ""} onClick={() => changeMode("alarm")}><AlarmClock size={15} /> Báo thức</button>
      </div>

      <strong className="timer-value" aria-live="off">{visibleTime}</strong>
      <p>
        {mode === "countdown" ? "Hẹn giờ tùy chỉnh" : mode === "stopwatch" ? "Đồng hồ bấm giờ" : running ? `Báo lúc ${alarmTime}` : "Chọn giờ báo thức"}
      </p>

      {mode === "countdown" && !running && (
        <div className="timer-config">
          <label><span>Giờ</span><input inputMode="numeric" type="number" min="0" max="99" value={durationHours} onChange={(event) => setDurationHours(event.target.value)} /></label>
          <label><span>Phút</span><input inputMode="numeric" type="number" min="0" max="59" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></label>
          <label><span>Giây</span><input inputMode="numeric" type="number" min="0" max="59" value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} /></label>
          <button type="button" onClick={applyDuration}>Áp dụng</button>
        </div>
      )}

      {mode === "alarm" && !running && (
        <label className="alarm-input">
          <span>Giờ báo</span>
          <input type="time" value={alarmTime} onChange={(event) => setAlarmTime(event.target.value)} />
        </label>
      )}

      <div className="timer-actions">
        <button type="button" className="timer-main" onClick={startOrPause}>
          {running ? <Pause size={18} /> : mode === "alarm" ? <BellRing size={18} /> : <Play size={18} />}
          {running ? "Tạm dừng" : mode === "alarm" ? "Đặt báo thức" : "Bắt đầu"}
        </button>
        <button type="button" onClick={reset} aria-label="Đặt lại đồng hồ"><RotateCcw size={18} /></button>
      </div>
      <small className="timer-note">Thông báo chính xác nhất khi RemindUp đang mở hoặc còn hoạt động nền.</small>
    </section>
  );
}

function Dashboard(props: {
  now: Date;
  timeText: string;
  selectedDate: string;
  selectedTasks: PlannerTask[];
  nextTask?: PlannerTask;
  completion: number;
  completedSelected: number;
  overdueCount: number;
  notes: PlannerNote[];
  toggleTask: (task: PlannerTask) => void;
  openTask: (task?: PlannerTask, dueDate?: string) => void;
  openNote: () => void;
  setView: (view: View) => void;
  selectDate: (value: string) => void;
  showFeedback: (message: string) => void;
}) {
  const week = createWeek(props.now);
  const today = localDateKey(props.now);
  const selectedIsPast = props.selectedDate < today;
  const selectedLabel = dateContextLabel(props.selectedDate, today);
  const dateLong = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(props.now);
  const pinned = props.notes.filter((note) => note.isPinned).slice(0, 2);
  return (
    <>
      <section className="hero-row">
        <div>
          <p className="hero-date">{dateLong}</p>
          <h1>{greetingFor(props.now.getHours())}, Thanh Hồng.</h1>
          <p className="hero-copy">Một nơi gọn gàng để chọn việc cần làm và giữ nhịp cho ngày hôm nay.</p>
        </div>
        <div className="live-clock" aria-label={`Bây giờ là ${props.timeText}`}>
          <Clock3 size={18} /><strong>{props.timeText}</strong><span>GMT+7</span>
        </div>
      </section>

      <section className="week-strip" aria-label="Bảy ngày gần đây">
        {week.map((date) => {
          const key = dateKey(date);
          const active = key === props.selectedDate;
          const past = key < today;
          return (
            <button
              key={date.toISOString()}
              type="button"
              className={`${active ? "active" : ""} ${past ? "past" : ""}`}
              onClick={() => props.selectDate(key)}
              aria-pressed={active}
              aria-label={`${past ? "Ngày đã qua" : key === today ? "Hôm nay" : "Ngày sắp tới"}, ${formatShortDate(key)}`}
            >
              <span>{dayNames[date.getDay()]}</span><strong>{date.getDate()}</strong>
              {active && <i />}
            </button>
          );
        })}
      </section>

      <div className={`date-context ${selectedIsPast ? "past" : ""}`}>
        <div>
          <CalendarDays size={18} />
          <span><strong>{selectedLabel}</strong><small>{props.selectedTasks.length} công việc</small></span>
        </div>
        {selectedIsPast ? (
          <span className="date-context-note">Thời gian này đã qua</span>
        ) : (
          <button type="button" onClick={() => props.openTask(undefined, props.selectedDate)}>
            <Plus size={17} /> Thêm công việc
          </button>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="focus-card">
            <div className="focus-topline">
              <span><Flame size={17} /> Tiếp theo</span>
              <span>{props.nextTask ? countdownTo(props.nextTask, props.now) : "Chưa có công việc"}</span>
            </div>
            {props.nextTask ? (
              <>
                <h2>{props.nextTask.title}</h2>
                <p>{props.nextTask.startTime}-{props.nextTask.endTime} / {props.nextTask.category}</p>
                <div className="focus-progress"><span style={{ width: `${props.nextTask.progress}%` }} /></div>
                <div className="focus-actions">
                  <button type="button" onClick={() => props.openTask(props.nextTask)}>Mở công việc</button>
                  <button type="button" className="ghost-dark" onClick={() => props.toggleTask(props.nextTask!)}><Check size={17} /> Đánh dấu xong</button>
                </div>
              </>
            ) : (
              <div className="start-panel">
                <span className="start-icon"><Plus size={22} /></span>
                <div>
                  <h2>Bắt đầu bằng một việc quan trọng</h2>
                  <p>Thêm công việc đầu tiên. RemindUp sẽ sắp xếp phần còn lại cho bạn.</p>
                </div>
                <button type="button" onClick={() => props.openTask()}>Thêm công việc</button>
              </div>
            )}
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div><p className="section-kicker">{selectedLabel}</p><h2>Danh sách công việc</h2></div>
              <button type="button" className="text-button" onClick={() => props.setView("calendar")}>Mở lịch <ChevronRight size={16} /></button>
            </div>
            <div className="task-list">
              {props.selectedTasks.length ? props.selectedTasks.map((task) => (
                <TaskCard key={task.id} task={task} toggle={() => props.toggleTask(task)} edit={() => props.openTask(task)} />
              )) : (
                <EmptyState
                  icon={selectedIsPast ? ArchiveRestore : Check}
                  title={selectedIsPast ? "Ngày này không có công việc" : "Chưa có việc trong ngày này"}
                  copy={selectedIsPast ? "Bạn đang xem một ngày đã qua. Không thể tạo lịch mới cho thời điểm này." : "Thêm một việc có thời gian cụ thể để bắt đầu lập kế hoạch."}
                  action={!selectedIsPast ? <button className="secondary-button" type="button" onClick={() => props.openTask(undefined, props.selectedDate)}>Thêm công việc</button> : undefined}
                />
              )}
            </div>
          </section>
        </div>

        <aside className="dashboard-side">
          <section className="metric-card">
            <div className="metric-title"><span className="metric-icon"><Sparkles size={17} /></span><div><p>Tiến độ ngày chọn</p><strong>{props.completion}%</strong></div></div>
            <div className="metric-grid">
              <div><strong>{props.completedSelected}</strong><span>Đã xong</span></div>
              <div><strong>{props.selectedTasks.length}</strong><span>Tổng việc</span></div>
              <div><strong>{props.overdueCount}</strong><span>Quá hạn</span></div>
            </div>
          </section>

          <ClockCard onFeedback={props.showFeedback} />

          <section className="notes-card">
            <div className="card-mini-heading"><span><FileText size={18} /> Ghi chú ghim</span><button type="button" onClick={props.openNote} aria-label="Tạo ghi chú"><Plus size={18} /></button></div>
            {pinned.length ? pinned.map((note) => (
              <article key={note.id}><strong>{note.title}</strong><p>{note.content}</p></article>
            )) : <div className="mini-empty"><p>Chưa có ghi chú ghim.</p><button type="button" onClick={props.openNote}>Thêm ghi chú</button></div>}
          </section>
        </aside>
      </div>
    </>
  );
}

function TaskCard({ task, toggle, edit }: { task: PlannerTask; toggle: () => void; edit: () => void }) {
  const completed = task.status === "completed";
  return (
    <article className={`task-card priority-${task.priority} ${completed ? "completed" : ""}`}>
      <button type="button" className="task-check" onClick={toggle} aria-label={completed ? "Mở lại công việc" : "Đánh dấu hoàn thành"}>
        {completed ? <Check size={16} /> : <Circle size={18} />}
      </button>
      <button type="button" className="task-body" onClick={edit}>
        <span className="task-top"><strong>{task.title}</strong><span className={`priority-pill ${task.priority}`}>{priorityLabel[task.priority]}</span></span>
        <span className="task-meta"><Clock3 size={14} /> {task.startTime}-{task.endTime}<i />{task.category}{task.repeatRule && task.repeatRule.frequency !== "none" && <><i />{repeatLabels[task.repeatRule.frequency]}</>}</span>
        {task.progress > 0 && task.progress < 100 && <span className="task-progress"><i style={{ width: `${task.progress}%` }} /></span>}
      </button>
      <button type="button" className="task-more" onClick={edit} aria-label="Chỉnh sửa công việc"><MoreHorizontal size={18} /></button>
    </article>
  );
}

function CalendarView({ tasks, selectedDate, setSelectedDate, toggleTask, openTask, setToast }: {
  tasks: PlannerTask[];
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  toggleTask: (task: PlannerTask) => void;
  openTask: (task?: PlannerTask) => void;
  setToast: (value: string) => void;
}) {
  const selected = new Date(`${selectedDate}T00:00:00`);
  const week = createWeek(selected);
  const today = localDateKey();
  const selectedIsPast = selectedDate < today;
  const dayTasks = tasks.filter((task) => task.dueDate === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const moveDay = (offset: number) => {
    const date = new Date(selected);
    date.setDate(date.getDate() + offset);
    setSelectedDate(dateKey(date));
  };
  const selectDay = (value: string) => {
    setSelectedDate(value);
    if (value < today) setToast("Ngày này đã qua. Bạn chỉ có thể xem lại công việc");
    else setToast(value === today ? "Đã trở về hôm nay" : `Đã chọn ${formatShortDate(value)}`);
  };
  const addToSelectedDay = () => {
    if (selectedIsPast) {
      setToast("Thời gian này đã cũ. Hãy chọn hôm nay hoặc một ngày trong tương lai");
      return;
    }
    openTask();
  };
  return (
    <section>
      <div className="page-heading">
        <div><p className="eyebrow">Theo ngày</p><h1>Lịch của bạn</h1><p>Xem nhanh thời gian bận và khoảng trống trong ngày.</p></div>
        <button className="primary-button" type="button" aria-disabled={selectedIsPast} onClick={addToSelectedDay}><Plus size={18} /> Tạo lịch</button>
      </div>
      <div className="calendar-toolbar">
        <button type="button" onClick={() => moveDay(-7)} aria-label="Tuần trước"><ChevronLeft size={19} /></button>
        <strong>Tháng {selected.getMonth() + 1}, {selected.getFullYear()}</strong>
        <button type="button" onClick={() => moveDay(7)} aria-label="Tuần sau"><ChevronRight size={19} /></button>
      </div>
      <div className="calendar-week">
        {week.map((date) => {
          const key = dateKey(date);
          const count = tasks.filter((task) => task.dueDate === key).length;
          return (
            <button key={key} type="button" className={`${key === selectedDate ? "active" : ""} ${key < today ? "past" : ""}`} onClick={() => selectDay(key)} aria-pressed={key === selectedDate}>
              <span>{dayNames[date.getDay()]}</span><strong>{date.getDate()}</strong>{count > 0 && <i>{count}</i>}
            </button>
          );
        })}
      </div>
      <div className="timeline-card">
        <div className="timeline-head"><div><strong>{new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long" }).format(selected)}</strong><span>{dayTasks.length} hoạt động{selectedIsPast ? " / đã qua" : ""}</span></div><button type="button" onClick={() => selectDay(today)}>Hôm nay</button></div>
        {dayTasks.length ? (
          <div className="timeline-list">
            {dayTasks.map((task) => (
              <div key={task.id} className="timeline-row">
                <time>{task.startTime}<span>{task.endTime}</span></time>
                <i className={`timeline-dot ${task.priority}`} />
                <TaskCard task={task} toggle={() => toggleTask(task)} edit={() => openTask(task)} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={selectedIsPast ? "Ngày này không có lịch" : "Ngày này chưa có lịch"}
            copy={selectedIsPast ? "Thời gian này đã qua và chỉ được dùng để xem lại." : "Đây là một khoảng trống tốt để nghỉ ngơi hoặc lên kế hoạch mới."}
            action={!selectedIsPast ? <button className="secondary-button" type="button" onClick={addToSelectedDay}>Thêm hoạt động</button> : undefined}
          />
        )}
      </div>
    </section>
  );
}

function NotesView({ notes, query, openNote, refresh, setToast }: {
  notes: PlannerNote[];
  query: string;
  openNote: () => void;
  refresh: () => Promise<void>;
  setToast: (value: string) => void;
}) {
  const normalized = query.trim().toLocaleLowerCase("vi");
  const visible = notes
    .filter((note) => !normalized || `${note.title} ${note.content} ${note.tags.join(" ")}`.toLocaleLowerCase("vi").includes(normalized))
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  const remove = async (note: PlannerNote) => {
    await db.notes.update(note.id, { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await refresh();
    setToast("Đã chuyển ghi chú vào thùng rác");
  };
  const togglePin = async (note: PlannerNote) => {
    await db.notes.update(note.id, { isPinned: !note.isPinned, updatedAt: new Date().toISOString() });
    await refresh();
    setToast(note.isPinned ? "Đã bỏ ghim ghi chú" : "Đã ghim lên Dashboard");
  };
  return (
    <section>
      <div className="page-heading">
        <div><p className="eyebrow">Ý tưởng và thông tin</p><h1>Ghi chú</h1><p>Lưu điều cần nhớ và xem lại ngay cả khi ngoại tuyến.</p></div>
        <button className="primary-button" type="button" onClick={openNote}><Plus size={18} /> Ghi chú mới</button>
      </div>
      {visible.length ? (
        <div className="note-grid">
          {visible.map((note, index) => (
            <article className={`note-tile note-tone-${index % 4}`} key={note.id}>
              {note.imageData && (
                // IndexedDB data URLs are already resized and cannot use the server image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={note.thumbnailData ?? note.imageData} alt="" />
              )}
              <div className="note-tile-top"><span>{note.category}</span><button type="button" onClick={() => togglePin(note)} aria-label={note.isPinned ? "Bỏ ghim" : "Ghim ghi chú"}>{note.isPinned ? <Flame size={17} /> : <Tag size={17} />}</button></div>
              <h2>{note.title}</h2><p>{note.content}</p>
              <footer><span>{formatShortDate(note.updatedAt.slice(0, 10))}</span><button type="button" onClick={() => remove(note)} aria-label="Xóa ghi chú"><Trash2 size={16} /></button></footer>
            </article>
          ))}
        </div>
      ) : <EmptyState icon={FileText} title="Chưa có ghi chú" copy="Tạo ghi chú đầu tiên để lưu ý tưởng, danh sách hoặc thông tin quan trọng." action={<button className="secondary-button" type="button" onClick={openNote}>Thêm ghi chú</button>} />}
    </section>
  );
}

function SettingsView({
  dark,
  setDark,
  clock24,
  setClock24,
  showSeconds,
  setShowSeconds,
  exportData,
  importRef,
  importData,
  requestStorage,
  requestNotifications,
  pinConfigured,
  configurePin,
  lockNow,
}: {
  dark: boolean;
  setDark: (value: boolean) => void;
  clock24: boolean;
  setClock24: (value: boolean) => void;
  showSeconds: boolean;
  setShowSeconds: (value: boolean) => void;
  exportData: () => void;
  importRef: React.RefObject<HTMLInputElement | null>;
  importData: (file?: File) => void;
  requestStorage: () => void;
  requestNotifications: () => void;
  pinConfigured: boolean;
  configurePin: () => void;
  lockNow: () => void;
}) {
  return (
    <section>
      <div className="page-heading"><div><p className="eyebrow">Cá nhân hóa</p><h1>Cài đặt</h1><p>Điều chỉnh trải nghiệm và bảo vệ dữ liệu trên thiết bị này.</p></div></div>
      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-title"><span><Sun size={20} /></span><div><h2>Giao diện</h2><p>Chọn chế độ hiển thị phù hợp.</p></div></div>
          <SettingToggle icon={dark ? Moon : Sun} label="Chế độ tối" copy="Giảm độ chói khi dùng buổi tối" value={dark} setValue={setDark} />
          <SettingToggle icon={Clock3} label="Định dạng 24 giờ" copy="Hiển thị 18:30 thay cho 6:30 PM" value={clock24} setValue={setClock24} />
          <SettingToggle icon={TimerReset} label="Hiển thị giây" copy="Cập nhật đồng hồ thời gian thực" value={showSeconds} setValue={setShowSeconds} />
        </section>
        <section className="settings-card">
          <div className="settings-title"><span><ShieldCheck size={20} /></span><div><h2>Dữ liệu & quyền riêng tư</h2><p>Dữ liệu hiện được lưu cục bộ bằng IndexedDB.</p></div></div>
          <button className="setting-action" type="button" onClick={requestStorage}><ShieldCheck size={19} /><span><strong>Bảo vệ lưu trữ</strong><small>Yêu cầu trình duyệt không tự dọn dữ liệu</small></span><ChevronRight size={18} /></button>
          <button className="setting-action" type="button" onClick={requestNotifications}><Bell size={19} /><span><strong>Quyền thông báo</strong><small>iPhone cần cài app vào Màn hình chính trước khi bật</small></span><ChevronRight size={18} /></button>
          <button className="setting-action" type="button" onClick={configurePin}><KeyRound size={19} /><span><strong>{pinConfigured ? "Đổi hoặc tắt PIN" : "Thiết lập PIN 6 số"}</strong><small>Tự khóa sau 5 phút hoặc khi rời ứng dụng</small></span><ChevronRight size={18} /></button>
          {pinConfigured && <button className="setting-action" type="button" onClick={lockNow}><LockKeyhole size={19} /><span><strong>Khóa ngay</strong><small>Yêu cầu PIN khi mở lại</small></span><ChevronRight size={18} /></button>}
        </section>
        <section className="settings-card wide">
          <div className="settings-title"><span><ArchiveRestore size={20} /></span><div><h2>Sao lưu & khôi phục</h2><p>Xuất một tệp JSON để chủ động giữ bản sao an toàn.</p></div></div>
          <div className="backup-actions">
            <button type="button" className="secondary-button" onClick={exportData}><Download size={18} /> Xuất dữ liệu</button>
            <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={18} /> Nhập bản sao</button>
            <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => importData(event.target.files?.[0])} />
          </div>
        </section>
      </div>
    </section>
  );
}

function SettingToggle({ icon: Icon, label, copy, value, setValue }: {
  icon: typeof Sun;
  label: string;
  copy: string;
  value: boolean;
  setValue: (value: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <Icon size={19} /><span><strong>{label}</strong><small>{copy}</small></span>
      <button className={`switch ${value ? "on" : ""}`} type="button" role="switch" aria-checked={value} onClick={() => setValue(!value)}><i /></button>
    </div>
  );
}

function LockScreen({ unlock }: { unlock: () => void }) {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Nhập PIN 6 số để tiếp tục.");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (blocked || busy) return;
    if (!/^\d{6}$/.test(pin)) {
      setMessage("PIN phải gồm đúng 6 chữ số.");
      return;
    }
    setBusy(true);
    const valid = await verifyPin(pin);
    setBusy(false);
    if (valid) {
      unlock();
      return;
    }
    const nextAttempts = attempts + 1;
    setPin("");
    if (nextAttempts >= 5) {
      setAttempts(0);
      setBlocked(true);
      setMessage("Đã nhập sai 5 lần. Vui lòng chờ 30 giây.");
      window.setTimeout(() => {
        setBlocked(false);
        setMessage("Bạn có thể thử lại.");
      }, 30_000);
    } else {
      setAttempts(nextAttempts);
      setMessage(`PIN chưa đúng. Còn ${5 - nextAttempts} lần trước khi tạm khóa.`);
    }
  };

  return (
    <main className="lock-screen">
      <section className="lock-card">
        <span className="lock-mark"><LockKeyhole size={25} /></span>
        <p className="eyebrow">Không gian riêng tư</p>
        <h1>RemindUp đang được khóa</h1>
        <p>{message}</p>
        <form onSubmit={submit}>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            disabled={blocked || busy}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-label="PIN 6 số"
            placeholder="••••••"
          />
          <button className="primary-button" type="submit" disabled={blocked || busy}>
            {busy ? "Đang kiểm tra…" : "Mở khóa"}
          </button>
        </form>
        <small>PIN chỉ khóa giao diện. Backup cloud sẽ dùng khóa mã hóa riêng.</small>
      </section>
    </main>
  );
}

function PinModal({ configured, close, saved, removed }: {
  configured: boolean;
  close: () => void;
  saved: () => void;
  removed: () => void;
}) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const validateCurrent = async () => {
    if (!configured) return true;
    if (!/^\d{6}$/.test(currentPin)) {
      setNotice("Vui lòng nhập PIN hiện tại.");
      return false;
    }
    if (!(await verifyPin(currentPin))) {
      setNotice("PIN hiện tại chưa đúng.");
      return false;
    }
    return true;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(newPin)) {
      setNotice("PIN mới phải gồm đúng 6 chữ số.");
      return;
    }
    if (newPin !== confirmPin) {
      setNotice("Hai lần nhập PIN mới chưa khớp.");
      return;
    }
    setBusy(true);
    if (!(await validateCurrent())) {
      setBusy(false);
      return;
    }
    await savePinVerifier(newPin);
    setBusy(false);
    saved();
  };

  const removePin = async () => {
    setBusy(true);
    if (!(await validateCurrent())) {
      setBusy(false);
      return;
    }
    window.localStorage.removeItem(pinStorageKey);
    setBusy(false);
    removed();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal-sheet compact" role="dialog" aria-modal="true" aria-labelledby="pin-modal-title">
        <div className="modal-head"><div><p className="eyebrow">Khóa nhanh giao diện</p><h2 id="pin-modal-title">{configured ? "Quản lý PIN" : "Thiết lập PIN"}</h2></div><button type="button" onClick={close} aria-label="Đóng"><X size={21} /></button></div>
        <form onSubmit={submit}>
          {configured && <label className="form-field full"><span>PIN hiện tại</span><input type="password" inputMode="numeric" maxLength={6} value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" /></label>}
          <div className="form-grid">
            <label className="form-field"><span>PIN mới</span><input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 chữ số" /></label>
            <label className="form-field"><span>Nhập lại PIN</span><input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 chữ số" /></label>
          </div>
          <div className="form-notice"><ShieldCheck size={18} /><span>PIN được kiểm tra bằng PBKDF2 với salt riêng và không được lưu dạng rõ. PIN là khóa giao diện, không thay thế recovery key dùng cho backup mã hóa.</span></div>
          {notice && <div className="form-notice danger-notice"><Bell size={18} /><span>{notice}</span></div>}
          <div className="modal-actions">
            {configured && <button className="danger-button" type="button" disabled={busy} onClick={() => void removePin()}><Trash2 size={17} /> Tắt PIN</button>}
            <span />
            <button className="secondary-button" type="button" onClick={close}>Hủy</button>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Đang bảo vệ…" : "Lưu PIN"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TaskModal({ task, tasks, initialDate, close, saved }: {
  task: PlannerTask | null;
  tasks: PlannerTask[];
  initialDate: string;
  close: () => void;
  saved: (message: string) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? initialDate);
  const [startTime, setStartTime] = useState(task?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(task?.endTime ?? "10:00");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [category, setCategory] = useState(task?.category ?? "Cá nhân");
  const [checklistText, setChecklistText] = useState(task?.checklist.map((item) => item.label).join("\n") ?? "");
  const [doneChecklistLabels, setDoneChecklistLabels] = useState<Set<string>>(
    () => new Set(task?.checklist.filter((item) => item.done).map((item) => item.label) ?? []),
  );
  const [reminderMinutes, setReminderMinutes] = useState(String(task?.reminderMinutes ?? 15));
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>(task?.repeatRule?.frequency ?? "none");
  const [repeatInterval, setRepeatInterval] = useState(String(task?.repeatRule?.interval ?? 1));
  const [repeatWeekdays, setRepeatWeekdays] = useState<Set<number>>(
    () => new Set(task?.repeatRule?.weekdays ?? []),
  );
  const [repeatEndType, setRepeatEndType] = useState<"never" | "date" | "count">(task?.repeatRule?.endType ?? "never");
  const [repeatEndDate, setRepeatEndDate] = useState(task?.repeatRule?.endDate ?? "");
  const [repeatCount, setRepeatCount] = useState(String(task?.repeatRule?.count ?? 10));
  const [notice, setNotice] = useState("");
  const [allowConflict, setAllowConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setNotice("Vui lòng nhập tiêu đề công việc.");
      return;
    }
    if (parseMinutes(endTime) <= parseMinutes(startTime)) {
      setNotice("Giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }
    if (!task && new Date(`${dueDate}T${endTime}:00`).getTime() <= Date.now()) {
      setNotice("Thời gian này đã cũ. Hãy chọn ngày và giờ trong tương lai.");
      return;
    }
    if (repeatFrequency === "weekly" && repeatWeekdays.size === 0) {
      setNotice("Vui lòng chọn ít nhất một ngày lặp trong tuần.");
      return;
    }
    if (repeatFrequency !== "none" && repeatEndType === "date" && !repeatEndDate) {
      setNotice("Vui lòng chọn ngày kết thúc chuỗi lặp.");
      return;
    }
    const conflict = tasks.find(
      (item) =>
        item.id !== task?.id &&
        item.dueDate === dueDate &&
        item.status !== "cancelled" &&
        parseMinutes(startTime) < parseMinutes(item.endTime) &&
        parseMinutes(endTime) > parseMinutes(item.startTime),
    );
    if (conflict && !allowConflict) {
      setNotice(`Trùng lịch với “${conflict.title}” (${conflict.startTime}-${conflict.endTime}). Nhấn “Vẫn lưu” nếu bạn muốn tiếp tục.`);
      setAllowConflict(true);
      return;
    }
    const timestamp = new Date().toISOString();
    const checklist = checklistText
      .split("\n")
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => ({
        id: task?.checklist.find((item) => item.label === label)?.id ?? crypto.randomUUID(),
        label,
        done: doneChecklistLabels.has(label),
      }));
    const done = checklist.filter((item) => item.done).length;
    const checklistProgress = checklist.length ? Math.round((done / checklist.length) * 100) : task?.progress ?? 0;
    const row: PlannerTask = {
      id: task?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      dueDate,
      startTime,
      endTime,
      priority,
      status: task?.status ?? "not_started",
      progress: checklistProgress,
      category,
      tags: task?.tags ?? [],
      checklist,
      reminderMinutes: Number(reminderMinutes),
      timezone: task?.timezone ?? "Asia/Ho_Chi_Minh",
      repeatRule: {
        frequency: repeatFrequency,
        interval: Math.max(1, Number(repeatInterval) || 1),
        weekdays: repeatFrequency === "weekly" ? [...repeatWeekdays].sort() : [],
        endType: repeatEndType,
        endDate: repeatEndType === "date" ? repeatEndDate : null,
        count: repeatEndType === "count" ? Math.max(1, Number(repeatCount) || 1) : null,
      },
      createdAt: task?.createdAt ?? timestamp,
      updatedAt: timestamp,
      completedAt: task?.completedAt ?? null,
    };
    setBusy(true);
    try {
      await db.tasks.put(row);
      await db.history.add({
        entityType: "task",
        entityId: row.id,
        action: task ? "Chỉnh sửa" : "Tạo mới",
        detail: row.title,
        createdAt: timestamp,
      });
      await saved(task ? "Đã cập nhật công việc" : "Đã tạo công việc mới");
    } catch {
      setBusy(false);
      setNotice("Không thể lưu công việc. Hãy kiểm tra dung lượng thiết bị và thử lại.");
    }
  };

  const remove = async () => {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setNotice("Công việc sẽ bị xóa vĩnh viễn. Nhấn “Xác nhận xóa” để tiếp tục.");
      return;
    }
    setBusy(true);
    try {
      await db.tasks.delete(task.id);
      await db.history.add({
        entityType: "task",
        entityId: task.id,
        action: "Xóa",
        detail: task.title,
        createdAt: new Date().toISOString(),
      });
      await saved("Đã xóa công việc");
    } catch {
      setBusy(false);
      setNotice("Không thể xóa công việc. Hãy thử lại.");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="modal-head"><div><p className="eyebrow">{task ? "Cập nhật kế hoạch" : `Thêm vào ${formatShortDate(initialDate)}`}</p><h2 id="task-modal-title">{task ? "Chỉnh sửa công việc" : "Công việc mới"}</h2></div><button type="button" onClick={close} aria-label="Đóng"><X size={21} /></button></div>
        <form onSubmit={submit}>
          <label className="form-field full"><span>Tiêu đề *</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nhập tên công việc" /></label>
          <label className="form-field full"><span>Mô tả</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Thêm nội dung giúp bạn bắt đầu dễ hơn…" /></label>
          <div className="form-grid">
            <label className="form-field"><span>Ngày</span><input type="date" min={task ? undefined : localDateKey()} value={dueDate} onChange={(event) => { setDueDate(event.target.value); setAllowConflict(false); setNotice(""); }} /></label>
            <label className="form-field"><span>Danh mục</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="form-field"><span>Bắt đầu</span><input type="time" value={startTime} onChange={(event) => { setStartTime(event.target.value); setAllowConflict(false); }} /></label>
            <label className="form-field"><span>Kết thúc</span><input type="time" value={endTime} onChange={(event) => { setEndTime(event.target.value); setAllowConflict(false); }} /></label>
            <label className="form-field"><span>Ưu tiên</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Nhắc trước</span><select value={reminderMinutes} onChange={(event) => setReminderMinutes(event.target.value)}><option value="5">5 phút</option><option value="15">15 phút</option><option value="30">30 phút</option><option value="60">1 giờ</option><option value="1440">1 ngày</option></select></label>
          </div>
          <label className="form-field full"><span>Checklist <small>(mỗi dòng một mục)</small></span><textarea value={checklistText} onChange={(event) => setChecklistText(event.target.value)} placeholder="Thêm các bước cần hoàn thành" /></label>
          {checklistText.trim() && (
            <div className="checklist-preview" aria-label="Tiến độ checklist">
              {checklistText.split("\n").map((label) => label.trim()).filter(Boolean).map((label) => {
                const done = doneChecklistLabels.has(label);
                return (
                  <button
                    key={label}
                    type="button"
                    className={done ? "done" : ""}
                    onClick={() => setDoneChecklistLabels((current) => {
                      const next = new Set(current);
                      if (next.has(label)) next.delete(label);
                      else next.add(label);
                      return next;
                    })}
                  >
                    <span>{done ? <Check size={14} /> : <Circle size={15} />}</span>{label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="recurrence-box">
            <div className="recurrence-heading"><RotateCcw size={17} /><span><strong>Lặp lại</strong><small>Múi giờ Asia/Ho_Chi_Minh</small></span></div>
            <div className="form-grid">
              <label className="form-field"><span>Chu kỳ</span><select value={repeatFrequency} onChange={(event) => setRepeatFrequency(event.target.value as RepeatFrequency)}>{Object.entries(repeatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="form-field"><span>Mỗi</span><div className="inline-number"><input type="number" min="1" max="365" value={repeatInterval} disabled={repeatFrequency === "none"} onChange={(event) => setRepeatInterval(event.target.value)} /><span>{repeatFrequency === "monthly" ? "tháng" : repeatFrequency === "yearly" ? "năm" : repeatFrequency === "weekly" ? "tuần" : "ngày"}</span></div></label>
            </div>
            {repeatFrequency === "weekly" && (
              <div className="weekday-picker" aria-label="Ngày lặp trong tuần">
                {dayNames.map((label, value) => (
                  <button
                    key={label}
                    type="button"
                    className={repeatWeekdays.has(value) ? "active" : ""}
                    onClick={() => setRepeatWeekdays((current) => {
                      const next = new Set(current);
                      if (next.has(value)) next.delete(value);
                      else next.add(value);
                      return next;
                    })}
                  >{label}</button>
                ))}
              </div>
            )}
            {repeatFrequency !== "none" && (
              <div className="form-grid repeat-end-grid">
                <label className="form-field"><span>Kết thúc</span><select value={repeatEndType} onChange={(event) => setRepeatEndType(event.target.value as "never" | "date" | "count")}><option value="never">Không giới hạn</option><option value="date">Đến ngày</option><option value="count">Sau số lần</option></select></label>
                {repeatEndType === "date" && <label className="form-field"><span>Ngày cuối</span><input type="date" min={dueDate} value={repeatEndDate} onChange={(event) => setRepeatEndDate(event.target.value)} /></label>}
                {repeatEndType === "count" && <label className="form-field"><span>Số lần</span><input type="number" min="1" max="999" value={repeatCount} onChange={(event) => setRepeatCount(event.target.value)} /></label>}
              </div>
            )}
          </div>
          {notice && <div className="form-notice"><AlarmClock size={18} /><span>{notice}</span></div>}
          <div className="modal-actions">
            {task && <button className="danger-button" type="button" disabled={busy} onClick={remove}><Trash2 size={17} /> {confirmDelete ? "Xác nhận xóa" : "Xóa"}</button>}
            <span />
            <button className="secondary-button" type="button" disabled={busy} onClick={close}>Hủy</button>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Đang lưu…" : allowConflict ? "Vẫn lưu" : task ? "Lưu thay đổi" : "Tạo công việc"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function NoteModal({ close, saved }: { close: () => void; saved: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Cá nhân");
  const [pinned, setPinned] = useState(true);
  const [imageData, setImageData] = useState<string>();
  const [thumbnailData, setThumbnailData] = useState<string>();
  const [notice, setNotice] = useState("");

  const readImage = async (file?: File) => {
    if (!file) return;
    try {
      setNotice("Đang tối ưu ảnh…");
      const optimized = await optimizeImage(file);
      setImageData(optimized.imageData);
      setThumbnailData(optimized.thumbnailData);
      setNotice("Ảnh đã được nén và loại bỏ metadata.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể xử lý ảnh.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setNotice("Vui lòng nhập tiêu đề ghi chú.");
      return;
    }
    const timestamp = new Date().toISOString();
    const row: PlannerNote = {
      id: crypto.randomUUID(),
      title: title.trim(),
      content: content.trim(),
      category,
      tags: [],
      isPinned: pinned,
      imageData,
      thumbnailData,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    await db.notes.add(row);
    await db.history.add({ entityType: "note", entityId: row.id, action: "Tạo mới", detail: row.title, createdAt: timestamp });
    await saved();
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal-sheet compact" role="dialog" aria-modal="true" aria-labelledby="note-modal-title">
        <div className="modal-head"><div><p className="eyebrow">Lưu lại điều quan trọng</p><h2 id="note-modal-title">Ghi chú mới</h2></div><button type="button" onClick={close} aria-label="Đóng"><X size={21} /></button></div>
        <form onSubmit={submit}>
          <label className="form-field full"><span>Tiêu đề *</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Tên ghi chú" /></label>
          <label className="form-field full"><span>Nội dung</span><textarea className="note-editor" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Bắt đầu viết…" /></label>
          <div className="form-grid">
            <label className="form-field"><span>Danh mục</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="image-picker"><ImagePlus size={20} /><span>{imageData ? "Đã tối ưu ảnh" : "Thêm ảnh"}</span><input type="file" accept="image/*" onChange={(event) => void readImage(event.target.files?.[0])} /></label>
          </div>
          <label className="check-row"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>Ghim lên Dashboard</span></label>
          {imageData && (
            // This local preview is generated in-browser before the record is saved.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="note-preview" src={imageData} alt="Ảnh xem trước" />
          )}
          {notice && <div className="form-notice"><Bell size={18} /><span>{notice}</span></div>}
          <div className="modal-actions"><span /><button className="secondary-button" type="button" onClick={close}>Hủy</button><button className="primary-button" type="submit">Lưu ghi chú</button></div>
        </form>
      </section>
    </div>
  );
}
