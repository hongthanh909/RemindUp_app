"use client";

import {
  AlarmClock,
  ArchiveRestore,
  Bell,
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
  seedPlanner,
} from "./db";

type View = "home" | "calendar" | "notes" | "settings";
type Modal = "task" | "note" | null;

const categories = ["Học tập", "Công việc", "Cá nhân", "Sức khỏe", "Tài chính", "Mục tiêu"];

const priorityLabel: Record<Priority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp",
};

const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const pad = (value: number) => String(value).padStart(2, "0");

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
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem("remindup-theme");
    return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });
  const [clock24, setClock24] = useState(() =>
    typeof window === "undefined" ? true : window.localStorage.getItem("remindup-clock24") !== "false",
  );
  const [showSeconds, setShowSeconds] = useState(() =>
    typeof window === "undefined" ? true : window.localStorage.getItem("remindup-seconds") !== "false",
  );
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [focusRunning, setFocusRunning] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

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
      await seedPlanner();
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
    if (!focusRunning) return;
    const timer = window.setInterval(() => {
      setFocusSeconds((value) => {
        if (value <= 1) {
          setFocusRunning(false);
          setToast("Hoàn thành một phiên tập trung 🎉");
          return 25 * 60;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusRunning]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
  const todayTasks = filteredTasks
    .filter((task) => task.dueDate === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const completedToday = todayTasks.filter((task) => task.status === "completed").length;
  const overdueCount = tasks.filter((task) => task.status === "overdue").length;
  const completion = todayTasks.length ? Math.round((completedToday / todayTasks.length) * 100) : 0;
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
    setToast(complete ? "Đã hoàn thành công việc" : "Đã mở lại công việc");
  };

  const openTask = (task?: PlannerTask) => {
    setEditingTask(task ?? null);
    setModal("task");
  };

  const exportData = async () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: await db.tasks.toArray(),
      notes: await db.notes.toArray(),
      history: await db.history.toArray(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `remindup-backup-${localDateKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Đã tạo bản sao lưu JSON");
  };

  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        version?: number;
        tasks?: PlannerTask[];
        notes?: PlannerNote[];
      };
      if (parsed.version !== 1 || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.notes)) {
        throw new Error("invalid");
      }
      await db.transaction("rw", db.tasks, db.notes, async () => {
        await db.tasks.bulkPut(parsed.tasks ?? []);
        await db.notes.bulkPut(parsed.notes ?? []);
      });
      await refresh();
      setToast("Khôi phục dữ liệu thành công");
    } catch {
      setToast("Tệp sao lưu không hợp lệ");
    }
  };

  const requestStorage = async () => {
    const granted = await navigator.storage?.persist?.();
    setToast(granted ? "Đã ưu tiên bảo vệ dữ liệu trên thiết bị" : "Trình duyệt chưa cấp lưu trữ bền vững");
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setToast("Trình duyệt này chưa hỗ trợ thông báo");
      return;
    }
    const result = await Notification.requestPermission();
    setToast(result === "granted" ? "Đã bật thông báo trong ứng dụng" : "Quyền thông báo chưa được bật");
  };

  if (loading) {
    return (
      <main className="app-loading" role="status">
        <span className="brand-mark"><Sparkles size={22} /></span>
        <p>Đang mở không gian của bạn…</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="desktop-rail" aria-label="Điều hướng chính">
        <div className="rail-brand"><span className="brand-mark"><Sparkles size={19} /></span><strong>RemindUp</strong></div>
        <Navigation view={view} setView={setView} openTask={() => openTask()} desktop />
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
              todayTasks={todayTasks}
              nextTask={nextTask}
              completion={completion}
              completedToday={completedToday}
              overdueCount={overdueCount}
              notes={notes}
              focusSeconds={focusSeconds}
              focusRunning={focusRunning}
              setFocusRunning={setFocusRunning}
              setFocusSeconds={setFocusSeconds}
              toggleTask={toggleTask}
              openTask={openTask}
              openNote={() => setModal("note")}
              setView={setView}
            />
          )}
          {view === "calendar" && (
            <CalendarView
              tasks={filteredTasks}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              toggleTask={toggleTask}
              openTask={openTask}
            />
          )}
          {view === "notes" && (
            <NotesView
              notes={notes}
              query={query}
              openNote={() => setModal("note")}
              refresh={refresh}
              setToast={setToast}
            />
          )}
          {view === "settings" && (
            <SettingsView
              dark={dark}
              setDark={setDark}
              clock24={clock24}
              setClock24={(value) => {
                setClock24(value);
                window.localStorage.setItem("remindup-clock24", String(value));
              }}
              showSeconds={showSeconds}
              setShowSeconds={(value) => {
                setShowSeconds(value);
                window.localStorage.setItem("remindup-seconds", String(value));
              }}
              exportData={exportData}
              importRef={importRef}
              importData={importData}
              requestStorage={requestStorage}
              requestNotifications={requestNotifications}
            />
          )}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Điều hướng chính">
        <Navigation view={view} setView={setView} openTask={() => openTask()} />
      </nav>

      {modal === "task" && (
        <TaskModal
          task={editingTask}
          tasks={tasks}
          close={() => {
            setModal(null);
            setEditingTask(null);
          }}
          saved={async (message) => {
            await refresh();
            setModal(null);
            setEditingTask(null);
            setToast(message);
          }}
        />
      )}
      {modal === "note" && (
        <NoteModal
          close={() => setModal(null)}
          saved={async () => {
            await refresh();
            setModal(null);
            setToast("Đã lưu ghi chú");
          }}
        />
      )}
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
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

function Dashboard(props: {
  now: Date;
  timeText: string;
  todayTasks: PlannerTask[];
  nextTask?: PlannerTask;
  completion: number;
  completedToday: number;
  overdueCount: number;
  notes: PlannerNote[];
  focusSeconds: number;
  focusRunning: boolean;
  setFocusRunning: (value: boolean) => void;
  setFocusSeconds: (value: number) => void;
  toggleTask: (task: PlannerTask) => void;
  openTask: (task?: PlannerTask) => void;
  openNote: () => void;
  setView: (view: View) => void;
}) {
  const week = createWeek(props.now);
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
          <p className="eyebrow">{dateLong}</p>
          <h1>{greetingFor(props.now.getHours())}, Thanh Hồng.</h1>
          <p className="hero-copy">Sắp xếp nhẹ nhàng, tập trung vào điều quan trọng nhất hôm nay.</p>
        </div>
        <div className="live-clock" aria-label={`Bây giờ là ${props.timeText}`}>
          <Clock3 size={18} /><strong>{props.timeText}</strong><span>GMT+7</span>
        </div>
      </section>

      <section className="week-strip" aria-label="Bảy ngày gần đây">
        {week.map((date) => {
          const active = dateKey(date) === localDateKey(props.now);
          return (
            <button key={date.toISOString()} type="button" className={active ? "active" : ""}>
              <span>{dayNames[date.getDay()]}</span><strong>{date.getDate()}</strong>
              {active && <i />}
            </button>
          );
        })}
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="focus-card">
            <div className="focus-topline">
              <span><Flame size={17} /> Tiếp theo</span>
              <span>{props.nextTask ? countdownTo(props.nextTask, props.now) : "Bạn đã hoàn tất"}</span>
            </div>
            {props.nextTask ? (
              <>
                <h2>{props.nextTask.title}</h2>
                <p>{props.nextTask.startTime}–{props.nextTask.endTime} · {props.nextTask.category}</p>
                <div className="focus-progress"><span style={{ width: `${props.nextTask.progress}%` }} /></div>
                <div className="focus-actions">
                  <button type="button" onClick={() => props.openTask(props.nextTask)}>Xem chi tiết</button>
                  <button type="button" className="ghost-dark" onClick={() => props.toggleTask(props.nextTask!)}><Check size={17} /> Hoàn thành</button>
                </div>
              </>
            ) : (
              <>
                <h2>Một ngày thật trọn vẹn.</h2>
                <p>Không còn công việc nào đang chờ bạn.</p>
              </>
            )}
            <span className="focus-orb one" /><span className="focus-orb two" />
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div><p className="eyebrow">Kế hoạch hôm nay</p><h2>Công việc của bạn</h2></div>
              <button type="button" className="text-button" onClick={() => props.setView("calendar")}>Xem lịch <ChevronRight size={16} /></button>
            </div>
            <div className="task-list">
              {props.todayTasks.length ? props.todayTasks.map((task) => (
                <TaskCard key={task.id} task={task} toggle={() => props.toggleTask(task)} edit={() => props.openTask(task)} />
              )) : (
                <EmptyState
                  icon={Check}
                  title="Hôm nay đang rất thoáng"
                  copy="Thêm một việc cần làm để bắt đầu ngày mới."
                  action={<button className="secondary-button" type="button" onClick={() => props.openTask()}>Tạo công việc</button>}
                />
              )}
            </div>
          </section>
        </div>

        <aside className="dashboard-side">
          <section className="metric-card">
            <div className="metric-title"><span className="metric-icon"><Sparkles size={17} /></span><div><p>Tiến độ hôm nay</p><strong>{props.completion}%</strong></div></div>
            <div className="ring" style={{ "--progress": `${props.completion * 3.6}deg` } as React.CSSProperties}><span>{props.completedToday}/{props.todayTasks.length}</span></div>
            <div className="metric-foot"><span><i className="dot success" /> Đã xong {props.completedToday}</span><span><i className="dot danger" /> Quá hạn {props.overdueCount}</span></div>
          </section>

          <section className="timer-card">
            <div className="card-mini-heading"><span><TimerReset size={18} /> Pomodoro</span><button type="button" aria-label="Tùy chọn hẹn giờ"><MoreHorizontal size={18} /></button></div>
            <strong className="timer-value">{pad(Math.floor(props.focusSeconds / 60))}:{pad(props.focusSeconds % 60)}</strong>
            <p>Phiên tập trung · 25 phút</p>
            <div className="timer-actions">
              <button type="button" className="timer-main" onClick={() => props.setFocusRunning(!props.focusRunning)}>
                {props.focusRunning ? <Pause size={18} /> : <Play size={18} />}
                {props.focusRunning ? "Tạm dừng" : "Bắt đầu"}
              </button>
              <button type="button" onClick={() => { props.setFocusRunning(false); props.setFocusSeconds(25 * 60); }} aria-label="Đặt lại hẹn giờ"><RotateCcw size={18} /></button>
            </div>
          </section>

          <section className="notes-card">
            <div className="card-mini-heading"><span><FileText size={18} /> Ghi chú ghim</span><button type="button" onClick={props.openNote} aria-label="Tạo ghi chú"><Plus size={18} /></button></div>
            {pinned.length ? pinned.map((note) => (
              <article key={note.id}><strong>{note.title}</strong><p>{note.content}</p></article>
            )) : <p className="muted">Chưa có ghi chú được ghim.</p>}
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
        <span className="task-meta"><Clock3 size={14} /> {task.startTime}–{task.endTime}<i />{task.category}</span>
        {task.progress > 0 && task.progress < 100 && <span className="task-progress"><i style={{ width: `${task.progress}%` }} /></span>}
      </button>
      <button type="button" className="task-more" onClick={edit} aria-label="Chỉnh sửa công việc"><MoreHorizontal size={18} /></button>
    </article>
  );
}

function CalendarView({ tasks, selectedDate, setSelectedDate, toggleTask, openTask }: {
  tasks: PlannerTask[];
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  toggleTask: (task: PlannerTask) => void;
  openTask: (task?: PlannerTask) => void;
}) {
  const selected = new Date(`${selectedDate}T00:00:00`);
  const week = createWeek(selected);
  const dayTasks = tasks.filter((task) => task.dueDate === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const moveDay = (offset: number) => {
    const date = new Date(selected);
    date.setDate(date.getDate() + offset);
    setSelectedDate(dateKey(date));
  };
  return (
    <section>
      <div className="page-heading">
        <div><p className="eyebrow">Timeline</p><h1>Lịch của bạn</h1><p>Xem nhanh thời gian bận và khoảng trống trong ngày.</p></div>
        <button className="primary-button" type="button" onClick={() => openTask()}><Plus size={18} /> Tạo lịch</button>
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
            <button key={key} type="button" className={key === selectedDate ? "active" : ""} onClick={() => setSelectedDate(key)}>
              <span>{dayNames[date.getDay()]}</span><strong>{date.getDate()}</strong>{count > 0 && <i>{count}</i>}
            </button>
          );
        })}
      </div>
      <div className="timeline-card">
        <div className="timeline-head"><div><strong>{new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long" }).format(selected)}</strong><span>{dayTasks.length} hoạt động</span></div><button type="button" onClick={() => setSelectedDate(localDateKey())}>Hôm nay</button></div>
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
          <EmptyState icon={CalendarDays} title="Ngày này chưa có lịch" copy="Đây là một khoảng trống tốt để nghỉ ngơi hoặc lên kế hoạch mới." action={<button className="secondary-button" type="button" onClick={() => openTask()}>Thêm hoạt động</button>} />
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
        <div><p className="eyebrow">Ý tưởng & thông tin</p><h1>Ghi chú</h1><p>Mọi thứ bạn muốn nhớ, luôn sẵn sàng ngay cả khi ngoại tuyến.</p></div>
        <button className="primary-button" type="button" onClick={openNote}><Plus size={18} /> Ghi chú mới</button>
      </div>
      {visible.length ? (
        <div className="note-grid">
          {visible.map((note, index) => (
            <article className={`note-tile note-tone-${index % 4}`} key={note.id}>
              {note.imageData && <img src={note.imageData} alt="" />}
              <div className="note-tile-top"><span>{note.category}</span><button type="button" onClick={() => togglePin(note)} aria-label={note.isPinned ? "Bỏ ghim" : "Ghim ghi chú"}>{note.isPinned ? <Flame size={17} /> : <Tag size={17} />}</button></div>
              <h2>{note.title}</h2><p>{note.content}</p>
              <footer><span>{formatShortDate(note.updatedAt.slice(0, 10))}</span><button type="button" onClick={() => remove(note)} aria-label="Xóa ghi chú"><Trash2 size={16} /></button></footer>
            </article>
          ))}
        </div>
      ) : <EmptyState icon={FileText} title="Chưa có ghi chú" copy="Ghi lại một ý tưởng, danh sách hoặc điều bạn không muốn quên." action={<button className="secondary-button" type="button" onClick={openNote}>Tạo ghi chú</button>} />}
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
          <button className="setting-action" type="button" onClick={requestNotifications}><Bell size={19} /><span><strong>Quyền thông báo</strong><small>Bật nhắc việc khi ứng dụng đang hoạt động</small></span><ChevronRight size={18} /></button>
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

function TaskModal({ task, tasks, close, saved }: {
  task: PlannerTask | null;
  tasks: PlannerTask[];
  close: () => void;
  saved: (message: string) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? localDateKey());
  const [startTime, setStartTime] = useState(task?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(task?.endTime ?? "10:00");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [category, setCategory] = useState(task?.category ?? "Cá nhân");
  const [checklistText, setChecklistText] = useState(task?.checklist.map((item) => item.label).join("\n") ?? "");
  const [doneChecklistLabels, setDoneChecklistLabels] = useState<Set<string>>(
    () => new Set(task?.checklist.filter((item) => item.done).map((item) => item.label) ?? []),
  );
  const [reminderMinutes, setReminderMinutes] = useState(String(task?.reminderMinutes ?? 15));
  const [notice, setNotice] = useState("");
  const [allowConflict, setAllowConflict] = useState(false);

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
    const conflict = tasks.find(
      (item) =>
        item.id !== task?.id &&
        item.dueDate === dueDate &&
        item.status !== "cancelled" &&
        parseMinutes(startTime) < parseMinutes(item.endTime) &&
        parseMinutes(endTime) > parseMinutes(item.startTime),
    );
    if (conflict && !allowConflict) {
      setNotice(`Trùng lịch với “${conflict.title}” (${conflict.startTime}–${conflict.endTime}). Nhấn “Vẫn lưu” nếu bạn muốn tiếp tục.`);
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
      createdAt: task?.createdAt ?? timestamp,
      updatedAt: timestamp,
      completedAt: task?.completedAt ?? null,
    };
    await db.tasks.put(row);
    await db.history.add({
      entityType: "task",
      entityId: row.id,
      action: task ? "Chỉnh sửa" : "Tạo mới",
      detail: row.title,
      createdAt: timestamp,
    });
    await saved(task ? "Đã cập nhật công việc" : "Đã tạo công việc mới");
  };

  const remove = async () => {
    if (!task) return;
    await db.tasks.delete(task.id);
    await db.history.add({
      entityType: "task",
      entityId: task.id,
      action: "Xóa",
      detail: task.title,
      createdAt: new Date().toISOString(),
    });
    await saved("Đã xóa công việc");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="modal-head"><div><p className="eyebrow">{task ? "Cập nhật kế hoạch" : "Thêm vào hôm nay"}</p><h2 id="task-modal-title">{task ? "Chỉnh sửa công việc" : "Công việc mới"}</h2></div><button type="button" onClick={close} aria-label="Đóng"><X size={21} /></button></div>
        <form onSubmit={submit}>
          <label className="form-field full"><span>Tiêu đề *</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Ôn thi Database Security" /></label>
          <label className="form-field full"><span>Mô tả</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Thêm nội dung giúp bạn bắt đầu dễ hơn…" /></label>
          <div className="form-grid">
            <label className="form-field"><span>Ngày</span><input type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); setAllowConflict(false); }} /></label>
            <label className="form-field"><span>Danh mục</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="form-field"><span>Bắt đầu</span><input type="time" value={startTime} onChange={(event) => { setStartTime(event.target.value); setAllowConflict(false); }} /></label>
            <label className="form-field"><span>Kết thúc</span><input type="time" value={endTime} onChange={(event) => { setEndTime(event.target.value); setAllowConflict(false); }} /></label>
            <label className="form-field"><span>Ưu tiên</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Nhắc trước</span><select value={reminderMinutes} onChange={(event) => setReminderMinutes(event.target.value)}><option value="5">5 phút</option><option value="15">15 phút</option><option value="30">30 phút</option><option value="60">1 giờ</option><option value="1440">1 ngày</option></select></label>
          </div>
          <label className="form-field full"><span>Checklist <small>(mỗi dòng một mục)</small></span><textarea value={checklistText} onChange={(event) => setChecklistText(event.target.value)} placeholder={"Đọc chương 1\nLàm đề thử\nXem lại ghi chú"} /></label>
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
          {notice && <div className="form-notice"><AlarmClock size={18} /><span>{notice}</span></div>}
          <div className="modal-actions">
            {task && <button className="danger-button" type="button" onClick={remove}><Trash2 size={17} /> Xóa</button>}
            <span />
            <button className="secondary-button" type="button" onClick={close}>Hủy</button>
            <button className="primary-button" type="submit">{allowConflict ? "Vẫn lưu" : task ? "Lưu thay đổi" : "Tạo công việc"}</button>
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
  const [notice, setNotice] = useState("");

  const readImage = (file?: File) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setNotice("Ảnh cần nhỏ hơn 4 MB cho phiên bản MVP.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageData(String(reader.result));
    reader.readAsDataURL(file);
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
            <label className="image-picker"><ImagePlus size={20} /><span>{imageData ? "Đã chọn ảnh" : "Thêm ảnh"}</span><input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0])} /></label>
          </div>
          <label className="check-row"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>Ghim lên Dashboard</span></label>
          {imageData && <img className="note-preview" src={imageData} alt="Ảnh xem trước" />}
          {notice && <div className="form-notice"><Bell size={18} /><span>{notice}</span></div>}
          <div className="modal-actions"><span /><button className="secondary-button" type="button" onClick={close}>Hủy</button><button className="primary-button" type="submit">Lưu ghi chú</button></div>
        </form>
      </section>
    </div>
  );
}
