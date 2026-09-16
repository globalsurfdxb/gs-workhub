import { Priority, TaskStatus } from "@/lib/shared";
import type { BadgeProps } from "@/components/ui/badge";

export interface UserSummary {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
}

export interface TaskAssigneeEntry {
  id: string;
  taskId: string;
  userId: string;
  user: UserSummary;
}

export interface TaskWatcherEntry {
  id: string;
  taskId: string;
  userId: string;
  user: UserSummary;
}

/** Shape returned by GET /tasks (list) — one row per task, assignees resolved, counts only for watchers/subtasks. */
export interface TaskListItem {
  id: string;
  projectId: string;
  milestoneId?: string | null;
  parentTaskId?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string | null;
  estimatedHours?: number | null;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssigneeEntry[];
  watchersCount: number;
  subtasksCount: number;
}

export interface TasksListResponse {
  data: TaskListItem[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export interface SubtaskEntry {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
}

export interface CommentEntry {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: UserSummary;
}

export interface ActivityEntry {
  id: string;
  taskId: string;
  actorId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

/** Shape returned by GET /tasks/:id — full detail with relations. */
export interface TaskDetail {
  id: string;
  projectId: string;
  milestoneId?: string | null;
  parentTaskId?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string | null;
  estimatedHours?: number | null;
  isRecurring: boolean;
  /** ISO timestamp the work timer was last started, or null when idle. */
  activeTimerStartedAt?: string | null;
  /** Minutes banked by the timer across every start/stop session so far. */
  loggedMinutes?: number;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
  subtasks: SubtaskEntry[];
  assignees: TaskAssigneeEntry[];
  watchers: TaskWatcherEntry[];
  comments: CommentEntry[];
  activityEntries: ActivityEntry[];
}

export interface ProjectSummary {
  id: string;
  name: string;
}

export interface ProjectsListResponse {
  data: ProjectSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export const TASK_STATUS_ORDER: TaskStatus[] = [
  TaskStatus.BACKLOG,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.REVIEW,
  TaskStatus.TESTING,
  TaskStatus.COMPLETED,
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.BACKLOG]: "Backlog",
  [TaskStatus.TODO]: "To Do",
  [TaskStatus.IN_PROGRESS]: "In Progress",
  [TaskStatus.REVIEW]: "Review",
  [TaskStatus.TESTING]: "Testing",
  [TaskStatus.COMPLETED]: "Completed",
};

export const PRIORITY_ORDER: Priority[] = [
  Priority.CRITICAL,
  Priority.HIGH,
  Priority.MEDIUM,
  Priority.LOW,
];

export const PRIORITY_LABELS: Record<Priority, string> = {
  [Priority.CRITICAL]: "Critical",
  [Priority.HIGH]: "High",
  [Priority.MEDIUM]: "Medium",
  [Priority.LOW]: "Low",
};

export function statusBadgeVariant(status: TaskStatus): BadgeProps["variant"] {
  switch (status) {
    case TaskStatus.COMPLETED:
      return "success";
    case TaskStatus.IN_PROGRESS:
    case TaskStatus.TESTING:
      return "default";
    case TaskStatus.REVIEW:
      return "warning";
    case TaskStatus.TODO:
      return "secondary";
    default:
      return "muted";
  }
}

export function priorityBadgeVariant(priority: Priority): BadgeProps["variant"] {
  switch (priority) {
    case Priority.CRITICAL:
      return "destructive";
    case Priority.HIGH:
      return "warning";
    case Priority.MEDIUM:
      return "secondary";
    default:
      return "muted";
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
