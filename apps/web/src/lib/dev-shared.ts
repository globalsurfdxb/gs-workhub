"use client";

/**
 * Shared types, label maps, badge/colour assignments, and the Development-team
 * access hook, used by the Dashboard's Development view plus the standalone
 * Sprints and Bugs pages (Module 11 — Development Team / QA Team).
 *
 * Lives under `lib/` (not a single route's local folder) because three separate
 * routes — /dashboard, /sprints, /bugs — all depend on it.
 */

import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  isSuperAdminLevel,
  Priority,
  ProjectStatus,
  TaskStatus,
  type Department,
  type Team,
} from "@/lib/shared";
import type { BadgeProps } from "@/components/ui/badge";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";

export const DIGITAL_DEPARTMENT_CODE = "DIGITAL";
export const DEV_TEAM_CODE = "DIGITAL-DEV";
export const QA_TEAM_CODE = "DIGITAL-QA";

// ─────────────────────────────────────────────────────────────────────────────
// Development-team access — resolves the Development team and whether the
// signed-in user is allowed to see its Dashboard / Sprints / Bugs views.
// ─────────────────────────────────────────────────────────────────────────────

export function useDevTeamAccess() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = isSuperAdminLevel(user?.role);
  // Resolved for every signed-in non-Super-Admin so `isDevTeamLead` stays the
  // single gate below — no role pre-filter to keep in sync with it.
  const resolveDevTeam = !!user && !isSuperAdmin;

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
    enabled: resolveDevTeam,
  });

  const digitalDepartmentId = departmentsQuery.data?.find(
    (department) => department.code === DIGITAL_DEPARTMENT_CODE,
  )?.id;

  const teamsQuery = useQuery({
    queryKey: ["teams", digitalDepartmentId],
    queryFn: () => api.get<Team[]>(`/teams?departmentId=${digitalDepartmentId}`),
    enabled: resolveDevTeam && !!digitalDepartmentId,
  });

  const devTeam = teamsQuery.data?.find((team) => team.code === DEV_TEAM_CODE);

  // TEMPORARY RESTRICTION — Team-Lead-only for now by explicit product decision.
  // Expected to open specific pages (Sprints, Bugs) to Department Manager /
  // Super Admin later; keep this as the single gate to update when that happens.
  const isDevTeamLead = !!devTeam && user?.id === devTeam.teamLeadId;

  // Callers can use this to avoid flashing an "access denied" state while the
  // lookups that decide `isDevTeamLead` are still in flight.
  const isPending = resolveDevTeam && (departmentsQuery.isLoading || teamsQuery.isLoading);
  const isError = departmentsQuery.isError || teamsQuery.isError;

  return { devTeam, isDevTeamLead, isPending, isError };
}

// ─────────────────────────────────────────────────────────────────────────────
// Issue-tracker access — the wider gate used by /sprints and /bugs only.
//
// Same resolution pattern as `useDevTeamAccess` above, but resolves the QA team
// alongside the Development team, because QA owns bug verification and
// regression testing (Module 11) and the bug workflow has an explicit
// `QA_REVIEW` state. The Dashboard's Development Overview deliberately does NOT
// use this hook — its data is Development-specific and stays on
// `useDevTeamAccess`'s stricter Development-Team-Lead-only check.
// ─────────────────────────────────────────────────────────────────────────────

export function useIssueTrackerAccess() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = isSuperAdminLevel(user?.role);
  // Resolved for every signed-in non-Super-Admin so the team-lead comparisons
  // below stay the single gate — no role pre-filter to keep in sync with them.
  const resolveTeams = !!user && !isSuperAdmin;

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
    enabled: resolveTeams,
  });

  const digitalDepartmentId = departmentsQuery.data?.find(
    (department) => department.code === DIGITAL_DEPARTMENT_CODE,
  )?.id;

  // Development and QA are both teams of the Digital department, so a single
  // `teams?departmentId=` fetch resolves both by code.
  const teamsQuery = useQuery({
    queryKey: ["teams", digitalDepartmentId],
    queryFn: () => api.get<Team[]>(`/teams?departmentId=${digitalDepartmentId}`),
    enabled: resolveTeams && !!digitalDepartmentId,
  });

  const devTeam = teamsQuery.data?.find((team) => team.code === DEV_TEAM_CODE);
  const qaTeam = teamsQuery.data?.find((team) => team.code === QA_TEAM_CODE);

  const isDevTeamLead = !!devTeam && user?.id === devTeam.teamLeadId;
  const isQaTeamLead = !!qaTeam && user?.id === qaTeam.teamLeadId;

  /** The shared gate for /sprints and /bugs specifically — not the Dashboard. */
  const canAccessTracker = isDevTeamLead || isQaTeamLead;

  // Callers can use this to avoid flashing an "access denied" state while the
  // lookups that decide `canAccessTracker` are still in flight.
  const isPending = resolveTeams && (departmentsQuery.isLoading || teamsQuery.isLoading);
  const isError = departmentsQuery.isError || teamsQuery.isError;

  return { devTeam, qaTeam, isDevTeamLead, isQaTeamLead, canAccessTracker, isPending, isError };
}

// ─────────────────────────────────────────────────────────────────────────────
// Response shape of GET /teams/:id/dev-dashboard (see src/lib/mock/router.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface DevStat {
  value: number;
  deltaPct: number;
  trend: number[];
}

export interface DevDashboard {
  teamId: string;
  teamName: string;
  periodDays: number;
  stats: {
    activeProjects: DevStat;
    tasksInProgress: DevStat;
    tasksCompleted: DevStat;
    onTimeDeliveryPct: DevStat;
    bugsThisMonth: DevStat;
    teamUtilizationPct: DevStat;
  };
  projectsByStatus: { status: ProjectStatus; count: number }[];
  currentSprint: {
    name: string;
    daysLeft: number;
    totalTasks: number;
    completed: number;
    inProgress: number;
    /** Backlog + to do + review + testing, collapsed. */
    todo: number;
    completionPct: number;
  } | null;
  tasksByPriority: { priority: Priority; count: number }[];
  velocity: { sprintName: string; points: number }[];
  averageVelocity: number;
  bugsOverTime: { date: string; count: number }[];
  bugSummary: { total: number; resolved: number; open: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Response shape of GET /teams/:id/sprints
// ─────────────────────────────────────────────────────────────────────────────

export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED";

export interface SprintRow {
  id: string;
  projectId: string;
  project: { id: string; name: string } | null;
  name: string;
  goal: string;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  /** Sum of story points across every task in the sprint. */
  committedPoints: number;
  /** Sum of story points across the sprint's completed tasks. */
  completedPoints: number;
  totalTasks: number;
  completedTasks: number;
}

export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};

export function sprintStatusBadgeVariant(status: SprintStatus): BadgeProps["variant"] {
  switch (status) {
    case "ACTIVE":
      return "default";
    case "COMPLETED":
      return "success";
    default:
      return "muted";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Response shape of GET /teams/:id/bugs, PATCH /bugs/:id, POST /bugs
// ─────────────────────────────────────────────────────────────────────────────

export type BugStatus = "NEW" | "ASSIGNED" | "IN_PROGRESS" | "FIXED" | "QA_REVIEW" | "CLOSED";

export interface BugPersonSummary {
  id: string;
  fullName: string;
}

export interface BugStatusHistoryEntry {
  id: string;
  status: BugStatus;
  changedAt: string;
  changedBy: BugPersonSummary | null;
}

export interface BugRow {
  id: string;
  projectId: string;
  taskId: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: BugStatus;
  screenshotUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
  project: { id: string; name: string } | null;
  reporter: BugPersonSummary | null;
  assignee: BugPersonSummary | null;
  /** Every status transition, oldest first. */
  statusHistory: BugStatusHistoryEntry[];
}

export interface BugsListResponse {
  data: BugRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Every bug write also feeds the Dashboard Overview's bug stats, so both the
 * Bugs list/board and the bug detail slide-over invalidate through here.
 * Lives in `lib/` rather than a route file so the page and the slide-over can
 * share it without importing each other.
 */
export function invalidateBugQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["dev-bugs"] });
  queryClient.invalidateQueries({ queryKey: ["dev-dashboard"] });
}

export function invalidateSprintQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["dev-sprints"] });
  queryClient.invalidateQueries({ queryKey: ["dev-dashboard"] });
}

/**
 * Subset of `GET /teams/:id` (mock `teamDetail`) used to populate the assignee
 * picker in the bug detail slide-over.
 */
export interface DevTeamMemberOption {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  designation: string | null;
}

export interface DevTeamDetail {
  id: string;
  name: string;
  members: DevTeamMemberOption[];
}

export const BUG_STATUS_ORDER: BugStatus[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "FIXED",
  "QA_REVIEW",
  "CLOSED",
];

export const BUG_STATUS_LABELS: Record<BugStatus, string> = {
  NEW: "New",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  FIXED: "Fixed",
  QA_REVIEW: "QA Review",
  CLOSED: "Closed",
};

/** Mirrors how tasks/approvals are coloured: terminal = success, in-flight = default, waiting = warning. */
export function bugStatusBadgeVariant(status: BugStatus): BadgeProps["variant"] {
  switch (status) {
    case "CLOSED":
      return "success";
    case "IN_PROGRESS":
      return "default";
    case "FIXED":
    case "QA_REVIEW":
      return "warning";
    case "ASSIGNED":
      return "outline";
    default:
      return "secondary";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task rows (GET /tasks) — used by the sprint board
// ─────────────────────────────────────────────────────────────────────────────

export interface DevTaskAssignee {
  id: string;
  userId: string;
  user: { id: string; fullName: string };
}

export interface DevTaskRow {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string | null;
  sprintId?: string | null;
  storyPoints?: number | null;
  assignees: DevTaskAssignee[];
}

export interface DevTasksListResponse {
  data: DevTaskRow[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
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

// ─────────────────────────────────────────────────────────────────────────────
// Priority / project-status labels and chart colours
//
// Both cyclic orders below are fixed: they were run through the project's
// accessibility colour validator, and it is these specific adjacency orders
// that pass. Only statuses/priorities actually present are rendered, but their
// relative order is always preserved. Colours are token references, so the
// charts follow light/dark automatically.
// ─────────────────────────────────────────────────────────────────────────────

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  ProjectStatus.CANCELLED,
  ProjectStatus.PLANNING,
  ProjectStatus.COMPLETED,
  ProjectStatus.ON_HOLD,
  ProjectStatus.IN_PROGRESS,
  // Not part of the validated cycle (the Development portfolio has no projects
  // in Review); appended last so it never splits a validated adjacency.
  ProjectStatus.REVIEW,
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  [ProjectStatus.PLANNING]: "Planning",
  [ProjectStatus.IN_PROGRESS]: "In Progress",
  [ProjectStatus.ON_HOLD]: "On Hold",
  [ProjectStatus.REVIEW]: "Review",
  [ProjectStatus.COMPLETED]: "Completed",
  [ProjectStatus.CANCELLED]: "Cancelled",
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  [ProjectStatus.CANCELLED]: "hsl(var(--destructive))",
  [ProjectStatus.PLANNING]: "hsl(var(--secondary))",
  [ProjectStatus.COMPLETED]: "hsl(var(--success))",
  [ProjectStatus.ON_HOLD]: "hsl(var(--warning))",
  [ProjectStatus.IN_PROGRESS]: "hsl(var(--primary))",
  [ProjectStatus.REVIEW]: "hsl(var(--muted-foreground))",
};

export const PRIORITY_ORDER: Priority[] = [
  Priority.CRITICAL,
  Priority.MEDIUM,
  Priority.HIGH,
  Priority.LOW,
];

export const PRIORITY_COLORS: Record<Priority, string> = {
  [Priority.CRITICAL]: "hsl(var(--destructive))",
  [Priority.MEDIUM]: "hsl(var(--secondary))",
  [Priority.HIGH]: "hsl(var(--warning))",
  [Priority.LOW]: "hsl(var(--muted-foreground))",
};

/** Selection order for priority dropdowns — severity descending, not the chart cycle. */
export const PRIORITY_FILTER_ORDER: Priority[] = [
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

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
