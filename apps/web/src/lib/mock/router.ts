/**
 * Mock request router for GS WorkHub.
 *
 * `apiFetch` in `src/lib/api-client.ts` delegates here instead of calling
 * `fetch()` whenever NEXT_PUBLIC_USE_MOCK_DATA === "true". Every response is
 * shaped exactly as the consuming page component expects, and every write
 * mutates the in-memory fixture arrays in `./fixtures` so refetches reflect
 * the change.
 *
 * Routing miss → `new ApiError(404, …)`, so existing `error instanceof ApiError`
 * checks in the pages keep working unchanged.
 */

import {
  ApprovalStatus,
  ApprovalType,
  CredentialCategory,
  EmployeeAvailability,
  isDepartmentLevel,
  isSuperAdminLevel,
  NotificationType,
  Priority,
  ProjectMethodology,
  ProjectStatus,
  SystemRole,
  TaskStatus,
  TimesheetStatus,
} from "@/lib/shared";
import { ApiError } from "../api-client";
import { useAuthStore } from "@/store/auth-store";
import {
  approvalRequests,
  attachments,
  bugs,
  credentials,
  customRoles,
  dateOnly,
  departments,
  findDepartment,
  findProject,
  findTask,
  findTeam,
  findUser,
  folders,
  milestones,
  mockId,
  MOCK_CREDENTIALS,
  MOCK_ID_KIND,
  newMockId,
  notifications,
  organizations,
  projects,
  rolePermissions,
  sprints,
  taskActivityEntries,
  taskComments,
  tasks,
  teamIdsForUser,
  teamMembers,
  teams,
  timesheetEntries,
  users,
  type MockAttachment,
  type MockApprovalRequest,
  type MockBug,
  type MockBugStatus,
  type MockProjectCredential,
  type MockCustomRole,
  type MockDepartment,
  type MockFolder,
  type MockMilestone,
  type MockProject,
  type MockSprint,
  type MockTask,
  type MockTeam,
  type MockTimesheetEntry,
  type MockUser,
} from "./fixtures";

// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure
// ─────────────────────────────────────────────────────────────────────────────

interface RouteContext {
  params: string[];
  query: URLSearchParams;
  body: Record<string, unknown>;
  rawBody: unknown;
  method: string;
  path: string;
}

interface Route {
  method: string;
  regex: RegExp;
  handler: (ctx: RouteContext) => unknown;
}

/** Simulated network latency so loading skeletons/spinners actually render. */
function latency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 250));
}

function nowIso(): string {
  return new Date().toISOString();
}

/** The signed-in persona, read from the persisted auth store. */
function currentUser(): MockUser {
  const sessionUser = useAuthStore.getState().user;
  const resolved = findUser(sessionUser?.id);
  if (resolved) return resolved;
  // No session yet (or a stale id from an older fixture set) — fall back to the
  // Super Admin so read-only endpoints still return something sensible.
  const fallback = users.find((user) => user.role === SystemRole.SUPER_ADMIN);
  if (!fallback) throw new ApiError(401, "No authenticated user in mock mode.");
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function bool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function strArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function requireQueryInt(query: URLSearchParams, key: string, fallback: number): number {
  const parsed = Number(query.get(key));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function includesInsensitive(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.PLANNING,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.ON_HOLD,
  ProjectStatus.REVIEW,
];

function isActiveProject(project: MockProject): boolean {
  return ACTIVE_PROJECT_STATUSES.includes(project.status);
}

/** Mirrors the frontend's `ROLE_LABEL` (employees/page.tsx) — kept here too since designation falls back to it when no title is given. */
const ROLE_DESIGNATION_LABEL: Record<SystemRole, string> = {
  [SystemRole.SUPER_ADMIN]: "Super Admin",
  [SystemRole.MANAGER]: "Manager",
  [SystemRole.GENERAL_MANAGER]: "General Manager",
  [SystemRole.DEPARTMENT_MANAGER]: "Department Manager",
  [SystemRole.DEPARTMENT_HEAD]: "Department Head",
  [SystemRole.TEAM_LEAD]: "Team Lead",
  [SystemRole.EMPLOYEE]: "Employee",
  [SystemRole.CLIENT]: "Client",
};

// ─────────────────────────────────────────────────────────────────────────────
// DTO builders
// ─────────────────────────────────────────────────────────────────────────────

function userSummary(userId: string) {
  const user = findUser(userId);
  return {
    id: userId,
    fullName: user?.fullName ?? "Unknown user",
    email: user?.email ?? "unknown@globalsurf.ae",
    avatarUrl: user?.avatarUrl ?? null,
  };
}

function approvalUserSummary(userId: string | null) {
  if (!userId) return null;
  const user = findUser(userId);
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
}

function departmentDto(department: MockDepartment) {
  return {
    id: department.id,
    name: department.name,
    code: department.code,
    description: department.description,
    managerId: department.managerId,
    headId: department.headId,
    isArchived: department.isArchived,
    createdAt: department.createdAt,
  };
}

function managerDto(managerId?: string | null) {
  const manager = findUser(managerId);
  if (!manager) return null;
  return {
    id: manager.id,
    fullName: manager.fullName,
    email: manager.email,
    designation: manager.designation,
  };
}

function departmentListItem(department: MockDepartment) {
  return {
    ...departmentDto(department),
    manager: managerDto(department.managerId),
    head: managerDto(department.headId),
    teamCount: teams.filter((team) => team.departmentId === department.id && !team.isArchived).length,
    employeeCount: users.filter((user) => user.departmentId === department.id && user.isActive).length,
  };
}

function teamDto(team: MockTeam) {
  return {
    id: team.id,
    departmentId: team.departmentId,
    name: team.name,
    code: team.code,
    teamLeadId: team.teamLeadId,
    capacityHoursPerWeek: team.capacityHoursPerWeek,
    methodology: team.methodology,
    isArchived: team.isArchived,
    createdAt: team.createdAt,
  };
}

function teamLeadDto(teamLeadId: string | null) {
  const lead = findUser(teamLeadId);
  if (!lead) return null;
  return {
    id: lead.id,
    fullName: lead.fullName,
    email: lead.email,
    designation: lead.designation,
  };
}

function teamListItem(team: MockTeam) {
  const memberIds = teamMembers.filter((tm) => tm.teamId === team.id).map((tm) => tm.userId);
  return {
    ...teamDto(team),
    teamLead: teamLeadDto(team.teamLeadId),
    memberIds,
    _count: {
      members: memberIds.length,
      projects: projects.filter((project) => project.teamId === team.id).length,
    },
  };
}

function teamDetail(team: MockTeam) {
  const members = teamMembers
    .filter((tm) => tm.teamId === team.id)
    .map((tm) => {
      const user = findUser(tm.userId);
      return {
        id: tm.id,
        userId: tm.userId,
        joinedAt: tm.joinedAt,
        fullName: user?.fullName ?? "Unknown user",
        email: user?.email ?? "unknown@globalsurf.ae",
        designation: user?.designation ?? null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    ...teamDto(team),
    teamLead: teamLeadDto(team.teamLeadId),
    members,
    memberCount: members.length,
  };
}

function employeeListItem(user: MockUser) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    designation: user.designation,
    availability: user.availability,
    capacityHoursPerWeek: user.capacityHoursPerWeek,
    avatarUrl: user.avatarUrl,
    departmentId: user.departmentId,
    role: user.role,
  };
}

function employeeProfile(user: MockUser) {
  const department = findDepartment(user.departmentId);
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    designation: user.designation,
    skills: user.skills,
    availability: user.availability,
    capacityHoursPerWeek: user.capacityHoursPerWeek,
    avatarUrl: user.avatarUrl,
    departmentId: user.departmentId,
    isActive: user.isActive,
    department: department ? departmentDto(department) : null,
    teamIds: teamIdsForUser(user.id),
  };
}

/**
 * Super Admin / Manager / General Manager / Department Manager / Team Lead see
 * every project for oversight. Plain Employees and Clients only see projects
 * they own or have a task assigned in — the org-wide list isn't relevant to
 * their day-to-day work and would otherwise leak unrelated departments' work.
 */
function canSeeAllProjects(role: SystemRole): boolean {
  return isSuperAdminLevel(role) || role === SystemRole.DEPARTMENT_MANAGER || role === SystemRole.TEAM_LEAD;
}

function isProjectVisibleTo(project: MockProject, user: MockUser): boolean {
  if (canSeeAllProjects(user.role)) return true;
  // Department Head is scoped to their own department, but sees every
  // project in it — not just the ones they personally own or are assigned to.
  if (user.role === SystemRole.DEPARTMENT_HEAD) {
    return !!user.departmentId && project.departmentId === user.departmentId;
  }
  if (project.ownerId === user.id) return true;
  return tasks.some((task) => task.projectId === project.id && task.assigneeIds.includes(user.id));
}

/**
 * Who can create a credential at all. Department-or-above (see
 * `isDepartmentLevel`) plus Team Lead — Team Lead can add credentials but,
 * per `canManageAnyCredential` below, can only ever edit/delete their own.
 * Employee/Client can never create one.
 */
function canCreateCredentials(role: SystemRole): boolean {
  return isDepartmentLevel(role) || role === SystemRole.TEAM_LEAD;
}

/**
 * Who can edit/delete *any* credential in their scope, vs. only the ones
 * they personally created. Team Lead is deliberately excluded here — see
 * `canCreateCredentials` — so a Team Lead's own edit rights come only from
 * being the creator (checked alongside this at each call site).
 */
function canManageAnyCredential(role: SystemRole): boolean {
  return isDepartmentLevel(role);
}

/**
 * Who can see every credential for oversight, vs. only the ones they created
 * or were explicitly shared. Department Head is scoped to their own
 * department's projects, mirroring `isProjectVisibleTo` — a project-less
 * credential is invisible to them unless they created or were shared it.
 */
function isCredentialVisibleTo(credential: MockProjectCredential, user: MockUser): boolean {
  if (isSuperAdminLevel(user.role) || user.role === SystemRole.DEPARTMENT_MANAGER) return true;
  if (user.role === SystemRole.DEPARTMENT_HEAD) {
    const project = findProject(credential.projectId);
    if (project && project.departmentId === user.departmentId) return true;
  }
  if (credential.createdById === user.id) return true;
  return credential.sharedWithUserIds.includes(user.id);
}

function credentialDto(credential: MockProjectCredential) {
  const project = findProject(credential.projectId);
  return {
    id: credential.id,
    projectId: credential.projectId,
    projectName: project?.name ?? null,
    label: credential.label,
    category: credential.category,
    username: credential.username,
    password: credential.password,
    url: credential.url,
    notes: credential.notes,
    sharedWithUserIds: credential.sharedWithUserIds,
    sharedWith: credential.sharedWithUserIds.map(userSummary),
    createdBy: userSummary(credential.createdById),
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

/** Dedupe and drop blanks — the mock layer has no fixed module registry to validate keys against, so it trusts the frontend's `PERMISSION_MODULES` list. */
function normalizeModuleAccess(value: unknown): string[] {
  return Array.from(new Set((strArray(value) ?? []).map((key) => key.trim()).filter(Boolean)));
}

function customRoleDto(role: MockCustomRole) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    moduleAccess: role.moduleAccess,
    createdBy: userSummary(role.createdById),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function projectDto(project: MockProject) {
  return {
    id: project.id,
    departmentId: project.departmentId,
    teamId: project.teamId,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    startDate: project.startDate,
    dueDate: project.dueDate,
    healthScore: project.healthScore,
    ownerId: project.ownerId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function projectListItem(project: MockProject) {
  return {
    ...projectDto(project),
    _count: {
      tasks: tasks.filter((task) => task.projectId === project.id).length,
      milestones: milestones.filter((m) => m.projectId === project.id).length,
    },
  };
}

function milestoneDto(m: MockMilestone) {
  return {
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    dueDate: m.dueDate,
    isCompleted: m.isCompleted,
  };
}

function emptyTasksByStatus(): Record<TaskStatus, number> {
  return {
    [TaskStatus.BACKLOG]: 0,
    [TaskStatus.TODO]: 0,
    [TaskStatus.IN_PROGRESS]: 0,
    [TaskStatus.REVIEW]: 0,
    [TaskStatus.TESTING]: 0,
    [TaskStatus.COMPLETED]: 0,
  };
}

function projectDetail(project: MockProject) {
  const department = findDepartment(project.departmentId);
  const team = findTeam(project.teamId);
  const owner = findUser(project.ownerId);
  const tasksByStatus = emptyTasksByStatus();
  for (const task of tasks) {
    if (task.projectId === project.id) tasksByStatus[task.status] += 1;
  }

  return {
    ...projectDto(project),
    department: department ? { id: department.id, name: department.name } : null,
    team: team ? { id: team.id, name: team.name } : null,
    owner: owner ? { id: owner.id, fullName: owner.fullName, email: owner.email } : null,
    milestones: milestones.filter((m) => m.projectId === project.id).map(milestoneDto),
    tasksByStatus,
  };
}

function assigneeRows(task: MockTask) {
  return task.assigneeIds.map((userId) => ({
    id: `${task.id}::assignee::${userId}`,
    taskId: task.id,
    userId,
    user: userSummary(userId),
  }));
}

function watcherRows(task: MockTask) {
  return task.watcherIds.map((userId) => ({
    id: `${task.id}::watcher::${userId}`,
    taskId: task.id,
    userId,
    user: userSummary(userId),
  }));
}

function taskBase(task: MockTask) {
  return {
    id: task.id,
    projectId: task.projectId,
    milestoneId: task.milestoneId,
    parentTaskId: task.parentTaskId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    estimatedHours: task.estimatedHours,
    isRecurring: task.isRecurring,
    sprintId: task.sprintId,
    storyPoints: task.storyPoints,
    activeTimerStartedAt: task.activeTimerStartedAt ?? null,
    loggedMinutes: task.loggedMinutes ?? 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

/** Banks whatever the running timer has accrued and clears it. No-op if idle. */
function stopTaskTimer(task: MockTask): void {
  if (!task.activeTimerStartedAt) return;
  const elapsedMs = Date.now() - new Date(task.activeTimerStartedAt).getTime();
  task.loggedMinutes = (task.loggedMinutes ?? 0) + Math.max(0, Math.round(elapsedMs / 60000));
  task.activeTimerStartedAt = null;
}

function taskListItem(task: MockTask) {
  return {
    ...taskBase(task),
    assignees: assigneeRows(task),
    watchersCount: task.watcherIds.length,
    subtasksCount: tasks.filter((t) => t.parentTaskId === task.id).length,
  };
}

function taskDetail(task: MockTask) {
  const project = findProject(task.projectId);
  return {
    ...taskBase(task),
    project: project ? { id: project.id, name: project.name } : null,
    subtasks: tasks
      .filter((t) => t.parentTaskId === task.id)
      .map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
    assignees: assigneeRows(task),
    watchers: watcherRows(task),
    comments: taskComments
      .filter((comment) => comment.taskId === task.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((comment) => ({
        id: comment.id,
        taskId: comment.taskId,
        authorId: comment.authorId,
        body: comment.body,
        createdAt: comment.createdAt,
        author: userSummary(comment.authorId),
      })),
    activityEntries: taskActivityEntries
      .filter((entry) => entry.taskId === task.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((entry) => ({
        id: entry.id,
        taskId: entry.taskId,
        actorId: entry.actorId,
        field: entry.field,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        createdAt: entry.createdAt,
      })),
  };
}

function timesheetDto(entry: MockTimesheetEntry) {
  return {
    id: entry.id,
    employeeId: entry.employeeId,
    taskId: entry.taskId,
    taskTitle: findTask(entry.taskId)?.title ?? null,
    projectId: entry.projectId,
    projectName: findProject(entry.projectId)?.name ?? null,
    date: entry.date,
    hours: entry.hours,
    notes: entry.notes,
    status: entry.status,
  };
}

function approvalDto(approval: MockApprovalRequest) {
  const project = findProject(approval.projectId);
  return {
    id: approval.id,
    type: approval.type,
    status: approval.status,
    requesterId: approval.requesterId,
    approverId: approval.approverId,
    entityId: approval.entityId,
    entityLabel: approval.entityLabel,
    projectId: approval.projectId,
    comment: approval.comment,
    submittedAt: approval.submittedAt,
    decidedAt: approval.decidedAt,
    createdAt: approval.createdAt,
    requester: approvalUserSummary(approval.requesterId),
    approver: approvalUserSummary(approval.approverId),
    project: project ? { id: project.id, name: project.name } : null,
  };
}

function attachmentDto(file: MockAttachment) {
  return {
    id: file.id,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    blobPath: file.blobPath,
    version: file.version,
    uploadedById: file.uploadedById,
    projectId: file.projectId,
    taskId: file.taskId,
    folderId: file.folderId,
    createdAt: file.createdAt,
  };
}

function folderDto(folder: MockFolder) {
  return {
    id: folder.id,
    projectId: folder.projectId,
    parentFolderId: folder.parentFolderId,
    name: folder.name,
    createdById: folder.createdById,
    createdAt: folder.createdAt,
    fileCount: latestVersionsForScope(folder.projectId, null, folder.id).length,
    folderCount: folders.filter((f) => f.parentFolderId === folder.id).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint + bug DTOs (Development team workspace)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row of `GET /teams/:id/sprints`. Points and task counts are derived from
 * the sprint's tasks on every request: `committedPoints` covers every task in
 * the sprint regardless of status, `completedPoints` only the completed ones.
 */
function sprintRow(sprint: MockSprint) {
  const sprintTasks = tasks.filter((task) => task.sprintId === sprint.id);
  const completed = sprintTasks.filter((task) => task.status === TaskStatus.COMPLETED);
  const sumPoints = (rows: MockTask[]) =>
    rows.reduce((total, task) => total + (task.storyPoints ?? 0), 0);
  const project = findProject(sprint.projectId);

  return {
    id: sprint.id,
    projectId: sprint.projectId,
    project: project ? { id: project.id, name: project.name } : null,
    name: sprint.name,
    goal: sprint.goal,
    status: sprint.status,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    committedPoints: sumPoints(sprintTasks),
    completedPoints: sumPoints(completed),
    totalTasks: sprintTasks.length,
    completedTasks: completed.length,
  };
}

function bugPersonSummary(userId: string | null) {
  const user = findUser(userId);
  if (!user) return null;
  return { id: user.id, fullName: user.fullName };
}

/** One row of `GET /teams/:id/bugs`, `PATCH /bugs/:id` and `POST /bugs`. */
function bugRow(item: MockBug) {
  const project = findProject(item.projectId);
  const history =
    item.statusHistory && item.statusHistory.length > 0
      ? item.statusHistory
      : [
          {
            id: `${item.id}-seed`,
            status: item.status,
            changedById: item.reportedById,
            changedAt: item.createdAt,
          },
        ];
  return {
    id: item.id,
    projectId: item.projectId,
    taskId: item.taskId,
    title: item.title,
    description: item.description,
    priority: item.priority,
    status: item.status,
    screenshotUrl: item.screenshotUrl ?? null,
    createdAt: item.createdAt,
    resolvedAt: item.resolvedAt,
    project: project ? { id: project.id, name: project.name } : null,
    reporter: bugPersonSummary(item.reportedById),
    assignee: bugPersonSummary(item.assigneeId),
    statusHistory: history.map((entry) => ({
      id: entry.id,
      status: entry.status,
      changedAt: entry.changedAt,
      changedBy: bugPersonSummary(entry.changedById),
    })),
  };
}

/** `MockBugStatus` is a union rather than an enum, so the valid values live here. */
const BUG_STATUSES: MockBugStatus[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "FIXED",
  "QA_REVIEW",
  "CLOSED",
];

/** Statuses that mean the defect is off the open list — these stamp `resolvedAt`. */
const RESOLVED_BUG_STATUSES: MockBugStatus[] = ["FIXED", "CLOSED"];

function findBug(bugId: string | null | undefined): MockBug | undefined {
  return bugId ? bugs.find((item) => item.id === bugId) : undefined;
}

function findSprint(sprintId: string | null | undefined): MockSprint | undefined {
  return sprintId ? sprints.find((item) => item.id === sprintId) : undefined;
}

function teamProjectIdSet(teamId: string): Set<string> {
  return new Set(projects.filter((project) => project.teamId === teamId).map((project) => project.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Workload maths
// ─────────────────────────────────────────────────────────────────────────────

/** Roles that are actually resourced against project work. */
const RESOURCED_ROLES: SystemRole[] = [
  SystemRole.DEPARTMENT_MANAGER,
  SystemRole.TEAM_LEAD,
  SystemRole.EMPLOYEE,
];

function allocatedHoursFor(userId: string): number {
  return tasks
    .filter((task) => task.status !== TaskStatus.COMPLETED && task.assigneeIds.includes(userId))
    .reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);
}

function workloadSummary(user: MockUser) {
  const capacityHours = user.capacityHoursPerWeek;
  const allocatedHours = allocatedHoursFor(user.id);
  const utilizationPct =
    capacityHours > 0 ? Math.round((allocatedHours / capacityHours) * 1000) / 10 : 0;
  const status: "OVERLOADED" | "OPTIMAL" | "UNDERUTILIZED" =
    utilizationPct > 100 ? "OVERLOADED" : utilizationPct < 60 ? "UNDERUTILIZED" : "OPTIMAL";

  return {
    employeeId: user.id,
    employeeName: user.fullName,
    capacityHours,
    allocatedHours,
    utilizationPct,
    status,
  };
}

function workloadScope(query: URLSearchParams): MockUser[] {
  const departmentId = query.get("departmentId");
  const teamId = query.get("teamId");

  let scoped = users.filter((user) => user.isActive && RESOURCED_ROLES.includes(user.role));

  if (departmentId) {
    scoped = scoped.filter((user) => user.departmentId === departmentId);
  }
  if (teamId) {
    const memberIds = new Set(teamMembers.filter((tm) => tm.teamId === teamId).map((tm) => tm.userId));
    scoped = scoped.filter((user) => memberIds.has(user.id));
  }

  return scoped;
}

// ─────────────────────────────────────────────────────────────────────────────
// Development dashboard maths
//
// Everything here is derived from the fixtures on every request — the only
// hand-authored inputs are the sparkline *shapes*, because GS WorkHub keeps no
// day-by-day historical snapshots yet (see `devStat`).
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Local "YYYY-MM-DD" for an ISO timestamp, matching `dateOnly()`'s local-time basis. */
function localDateKey(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Midnight-normalised whole days from today until `isoString` (negative if past). */
function daysUntil(isoString: string): number {
  const target = new Date(isoString);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / DAY_MS);
}

/**
 * Wraps a computed metric with an illustrative sparkline. `shape` is a series of
 * multipliers ending at 1.0, so the trend always lands on the real value and
 * `deltaPct` (last point vs the one before it) is directionally consistent with
 * it. Nothing here invents a value — only its recent shape.
 */
function devStat(value: number, shape: number[]) {
  const trend = shape.map((factor) => Math.round(value * factor * 10) / 10);
  const previous = trend[trend.length - 2] ?? value;
  const deltaPct = previous > 0 ? Math.round(((value - previous) / previous) * 1000) / 10 : 0;
  return { value, deltaPct, trend };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Average per-member utilization, reusing the same maths as `/workload/employees`. */
function teamUtilizationPct(teamId: string): number {
  const memberIds = new Set(teamMembers.filter((tm) => tm.teamId === teamId).map((tm) => tm.userId));
  const members = users.filter(
    (user) => user.isActive && RESOURCED_ROLES.includes(user.role) && memberIds.has(user.id),
  );
  if (members.length === 0) return 0;
  const total = members.reduce((sum, member) => sum + workloadSummary(member).utilizationPct, 0);
  return round1(total / members.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval helpers
// ─────────────────────────────────────────────────────────────────────────────

const OPEN_APPROVAL_STATUSES: ApprovalStatus[] = [ApprovalStatus.PENDING, ApprovalStatus.SUBMITTED];

function canReviewFor(reviewer: MockUser, approval: MockApprovalRequest): boolean {
  if (approval.approverId) return approval.approverId === reviewer.id;

  const requester = findUser(approval.requesterId);
  if (!requester) return false;

  switch (reviewer.role) {
    case SystemRole.SUPER_ADMIN:
    case SystemRole.MANAGER:
    case SystemRole.GENERAL_MANAGER:
      return true;
    case SystemRole.DEPARTMENT_MANAGER:
      return !!reviewer.departmentId && requester.departmentId === reviewer.departmentId;
    case SystemRole.TEAM_LEAD: {
      const mine = new Set(teamIdsForUser(reviewer.id));
      return teamIdsForUser(requester.id).some((teamId) => mine.has(teamId));
    }
    default:
      return false;
  }
}

function pushNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  link: string | null,
): void {
  notifications.unshift({
    id: newMockId(MOCK_ID_KIND.NOTIFICATION),
    userId,
    type,
    title,
    body,
    link,
    isRead: false,
    createdAt: nowIso(),
  });
}

/**
 * Notify every employee in `userIds` at once (deduped, and never the actor
 * themselves — no one needs to be told about their own action). Used
 * anywhere a person is newly connected to something — assigned to a task,
 * made a project owner, or given access to a stored credential — so the
 * notification goes out the moment that connection is made.
 */
function notifyEmployees(
  userIds: (string | null | undefined)[],
  type: NotificationType,
  title: string,
  body: string,
  link: string | null,
): void {
  const actorId = currentUser().id;
  const seen = new Set<string>();
  for (const userId of userIds) {
    if (!userId || userId === actorId || seen.has(userId)) continue;
    seen.add(userId);
    pushNotification(userId, type, title, body, link);
  }
}

function decideApproval(
  approvalId: string | undefined,
  status: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED,
  comment: string | undefined,
) {
  const approval = approvalRequests.find((item) => item.id === approvalId);
  if (!approval) throw new ApiError(404, "Approval request not found.");
  if (!OPEN_APPROVAL_STATUSES.includes(approval.status)) {
    throw new ApiError(400, `This request has already been ${approval.status.toLowerCase()}.`);
  }

  const reviewer = currentUser();
  approval.status = status;
  approval.approverId = reviewer.id;
  approval.decidedAt = nowIso();
  if (comment) approval.comment = comment;

  // Keep the linked timesheet entry in sync.
  if (approval.type === ApprovalType.TIMESHEET) {
    const entry = timesheetEntries.find((item) => item.id === approval.entityId);
    if (entry) {
      entry.status =
        status === ApprovalStatus.APPROVED ? TimesheetStatus.APPROVED : TimesheetStatus.REJECTED;
    }
  }

  pushNotification(
    approval.requesterId,
    NotificationType.APPROVAL_REQUEST,
    `${approval.entityLabel} was ${status === ApprovalStatus.APPROVED ? "approved" : "rejected"}`,
    comment ?? `${reviewer.fullName} ${status === ApprovalStatus.APPROVED ? "approved" : "rejected"} your request.`,
    "/approvals",
  );

  return approvalDto(approval);
}

// ─────────────────────────────────────────────────────────────────────────────
// File helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tell whoever is "connected" to a newly added file — the task's assignees
 * for a task-scoped file, or the project's owner for a project-scoped one —
 * the moment it lands, so access changes surface immediately rather than
 * silently.
 */
function notifyConnectedToFile(file: MockAttachment): void {
  const actor = currentUser();
  if (file.taskId) {
    const task = findTask(file.taskId);
    if (task) {
      notifyEmployees(
        task.assigneeIds,
        NotificationType.TASK_UPDATE,
        `New file on “${task.title}”`,
        `${actor.fullName} added “${file.fileName}”.`,
        "/tasks",
      );
    }
  } else if (file.projectId) {
    const project = findProject(file.projectId);
    if (project) {
      notifyEmployees(
        [project.ownerId],
        NotificationType.PROJECT_UPDATE,
        `New file on “${project.name}”`,
        `${actor.fullName} added “${file.fileName}”.`,
        "/files",
      );
    }
  }
}

function latestVersionsForScope(
  projectId: string | null,
  taskId: string | null,
  folderId?: string | null,
): MockAttachment[] {
  let scoped = attachments.filter((file) =>
    projectId ? file.projectId === projectId : file.taskId === taskId,
  );
  // `folderId` is only meaningful for project scope — task-scoped files have
  // no folders. `undefined` means "don't filter by folder" (used by
  // `folderDto`'s file count, which only cares about a specific folder and
  // always passes a real id, never undefined — but keep the guard honest).
  if (projectId && folderId !== undefined) {
    scoped = scoped.filter((file) => file.folderId === folderId);
  }
  const latestByGroup = new Map<string, MockAttachment>();
  for (const file of scoped) {
    const current = latestByGroup.get(file.fileGroupId);
    if (!current || file.version > current.version) latestByGroup.set(file.fileGroupId, file);
  }
  return [...latestByGroup.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

const SEG = "([^/]+)";

const routes: Route[] = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    method: "POST",
    regex: /^\/auth\/login$/,
    handler: ({ body }) => {
      const email = (str(body.email) ?? "").trim().toLowerCase();
      const password = str(body.password) ?? "";
      const credential = MOCK_CREDENTIALS.find((item) => item.email.toLowerCase() === email);
      if (!credential || credential.password !== password) {
        throw new ApiError(401, "Invalid email or password.");
      }
      const user = findUser(credential.userId);
      if (!user) throw new ApiError(401, "Invalid email or password.");
      if (!user.isActive) throw new ApiError(403, "This account has been deactivated.");

      return {
        accessToken: `mock-access-token.${user.id}`,
        refreshToken: `mock-refresh-token.${user.id}`,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId,
          teamIds: teamIdsForUser(user.id),
        },
      };
    },
  },
  {
    method: "POST",
    regex: /^\/auth\/refresh$/,
    handler: ({ body }) => {
      const refreshToken = str(body.refreshToken) ?? "";
      const userId = refreshToken.split(".")[1] ?? currentUser().id;
      return {
        accessToken: `mock-access-token.${userId}`,
        refreshToken: `mock-refresh-token.${userId}`,
      };
    },
  },
  {
    method: "POST",
    regex: /^\/auth\/logout$/,
    handler: () => undefined,
  },

  // ── Organization (settings) ──────────────────────────────────────────────────
  // Single-tenant mock — there is only ever one organization record.
  {
    method: "GET",
    regex: /^\/organization$/,
    handler: () => {
      const organization = organizations[0];
      if (!organization) throw new ApiError(404, "Organization not found.");
      return organization;
    },
  },
  {
    method: "PATCH",
    regex: /^\/organization$/,
    handler: ({ body }) => {
      const organization = organizations[0];
      if (!organization) throw new ApiError(404, "Organization not found.");
      const name = str(body.name)?.trim();
      if (name) organization.name = name;
      const slug = str(body.slug)?.trim().toLowerCase();
      if (slug) {
        if (!/^[a-z0-9-]+$/.test(slug)) {
          throw new ApiError(400, "Slug may only contain lowercase letters, numbers, and hyphens.");
        }
        organization.slug = slug;
      }
      return organization;
    },
  },

  // ── Role permissions (Super Admin's RBAC matrix) ─────────────────────────────
  // Read by every signed-in user (the sidebar needs it to decide what to show);
  // only writable by Super-Admin-level roles.
  {
    method: "GET",
    regex: /^\/role-permissions$/,
    handler: () => rolePermissions,
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/role-permissions/${SEG}$`),
    handler: ({ params, body }) => {
      const requester = currentUser();
      if (!isSuperAdminLevel(requester.role)) {
        throw new ApiError(403, "Only Super Admins can manage role permissions.");
      }
      const key = params[0];
      if (!key || !(key in rolePermissions)) throw new ApiError(404, "Unknown permission module.");
      const roles = strArray(body.roles);
      if (!roles) throw new ApiError(400, "roles must be an array of role names.");
      const valid = roles.filter((role) => (Object.values(SystemRole) as string[]).includes(role)) as SystemRole[];
      // Super Admin can never be toggled off a module — otherwise a mistaken
      // save here could lock every admin out of the page that fixes it.
      const withSuperAdmin = new Set(valid);
      withSuperAdmin.add(SystemRole.SUPER_ADMIN);
      rolePermissions[key] = Array.from(withSuperAdmin);
      return { key, roles: rolePermissions[key] };
    },
  },

  // ── Custom roles (named permission templates, defined but not yet
  // assignable to an employee — see `MockCustomRole` in fixtures.ts) ──────────
  {
    method: "GET",
    regex: /^\/custom-roles$/,
    handler: () => {
      const requester = currentUser();
      if (!isSuperAdminLevel(requester.role)) {
        throw new ApiError(403, "Only Super Admins can manage custom roles.");
      }
      return customRoles
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(customRoleDto);
    },
  },
  {
    method: "POST",
    regex: /^\/custom-roles$/,
    handler: ({ body }) => {
      const requester = currentUser();
      if (!isSuperAdminLevel(requester.role)) {
        throw new ApiError(403, "Only Super Admins can create custom roles.");
      }
      const name = str(body.name)?.trim();
      if (!name) throw new ApiError(400, "Role name is required.");
      if (customRoles.some((role) => role.name.toLowerCase() === name.toLowerCase())) {
        throw new ApiError(409, "A role with this name already exists.");
      }
      const moduleAccess = normalizeModuleAccess(body.moduleAccess);
      const created: MockCustomRole = {
        id: newMockId(MOCK_ID_KIND.CUSTOM_ROLE),
        name,
        description: str(body.description)?.trim() || null,
        moduleAccess,
        createdById: requester.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      customRoles.push(created);
      return customRoleDto(created);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/custom-roles/${SEG}$`),
    handler: ({ params, body }) => {
      const requester = currentUser();
      if (!isSuperAdminLevel(requester.role)) {
        throw new ApiError(403, "Only Super Admins can manage custom roles.");
      }
      const role = customRoles.find((item) => item.id === params[0]);
      if (!role) throw new ApiError(404, "Custom role not found.");
      const name = str(body.name)?.trim();
      if (name) {
        if (customRoles.some((item) => item.id !== role.id && item.name.toLowerCase() === name.toLowerCase())) {
          throw new ApiError(409, "A role with this name already exists.");
        }
        role.name = name;
      }
      if ("description" in body) role.description = str(body.description)?.trim() || null;
      if ("moduleAccess" in body) {
        role.moduleAccess = normalizeModuleAccess(body.moduleAccess);
      }
      role.updatedAt = nowIso();
      return customRoleDto(role);
    },
  },
  {
    method: "DELETE",
    regex: new RegExp(`^/custom-roles/${SEG}$`),
    handler: ({ params }) => {
      const requester = currentUser();
      if (!isSuperAdminLevel(requester.role)) {
        throw new ApiError(403, "Only Super Admins can manage custom roles.");
      }
      const index = customRoles.findIndex((item) => item.id === params[0]);
      if (index === -1) throw new ApiError(404, "Custom role not found.");
      customRoles.splice(index, 1);
      return undefined;
    },
  },

  // ── Departments ───────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/departments$/,
    handler: ({ query }) => {
      const includeArchived = query.get("includeArchived") === "true";
      return departments
        .filter((department) => includeArchived || !department.isArchived)
        .map(departmentListItem);
    },
  },
  {
    method: "POST",
    regex: /^\/departments$/,
    handler: ({ body }) => {
      const name = str(body.name)?.trim();
      const code = str(body.code)?.trim().toUpperCase();
      if (!name || !code) throw new ApiError(400, "Name and code are required.");
      if (departments.some((department) => department.code === code)) {
        throw new ApiError(409, `A department with code ${code} already exists.`);
      }
      const managerId = str(body.managerId) ?? null;
      const manager = managerId ? findUser(managerId) : null;
      if (managerId && !manager) throw new ApiError(404, "Manager not found.");
      const headId = str(body.headId) ?? null;
      const head = headId ? findUser(headId) : null;
      if (headId && !head) throw new ApiError(404, "Department Head not found.");
      const created: MockDepartment = {
        id: newMockId(MOCK_ID_KIND.DEPARTMENT),
        organizationId: departments[0]?.organizationId ?? mockId(MOCK_ID_KIND.ORGANIZATION, 1),
        name,
        code,
        description: str(body.description)?.trim() || null,
        managerId,
        headId,
        isArchived: false,
        createdAt: nowIso(),
      };
      departments.push(created);
      if (manager) manager.role = SystemRole.DEPARTMENT_MANAGER;
      if (head) head.role = SystemRole.DEPARTMENT_HEAD;
      return departmentListItem(created);
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/departments/${SEG}$`),
    handler: ({ params }) => {
      const department = findDepartment(params[0]);
      if (!department) throw new ApiError(404, "Department not found.");
      const manager = findUser(department.managerId);
      const head = findUser(department.headId);
      const departmentTeams = teams.filter((team) => team.departmentId === department.id);

      return {
        ...departmentDto(department),
        teams: departmentTeams.map(teamDto),
        manager: manager
          ? {
              id: manager.id,
              fullName: manager.fullName,
              email: manager.email,
              designation: manager.designation,
              avatarUrl: manager.avatarUrl,
            }
          : null,
        head: head
          ? {
              id: head.id,
              fullName: head.fullName,
              email: head.email,
              designation: head.designation,
              avatarUrl: head.avatarUrl,
            }
          : null,
        dashboard: {
          activeProjectCount: projects.filter(
            (project) => project.departmentId === department.id && isActiveProject(project),
          ).length,
          employeeCount: users.filter((user) => user.departmentId === department.id && user.isActive)
            .length,
          teamCount: departmentTeams.filter((team) => !team.isArchived).length,
        },
      };
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/departments/${SEG}/resource-allocation$`),
    handler: ({ params }) => {
      const department = findDepartment(params[0]);
      if (!department) throw new ApiError(404, "Department not found.");
      const departmentUsers = users.filter(
        (user) => user.departmentId === department.id && user.isActive,
      );
      return {
        totalTeams: teams.filter((team) => team.departmentId === department.id && !team.isArchived)
          .length,
        totalEmployees: departmentUsers.length,
        totalWeeklyCapacityHours: departmentUsers.reduce(
          (sum, user) => sum + user.capacityHoursPerWeek,
          0,
        ),
      };
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/departments/${SEG}/archive$`),
    handler: ({ params }) => {
      const department = findDepartment(params[0]);
      if (!department) throw new ApiError(404, "Department not found.");
      department.isArchived = true;
      return departmentListItem(department);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/departments/${SEG}/unarchive$`),
    handler: ({ params }) => {
      const department = findDepartment(params[0]);
      if (!department) throw new ApiError(404, "Department not found.");
      department.isArchived = false;
      return departmentListItem(department);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/departments/${SEG}$`),
    handler: ({ params, body }) => {
      const department = findDepartment(params[0]);
      if (!department) throw new ApiError(404, "Department not found.");
      const name = str(body.name)?.trim();
      if (name) department.name = name;
      if ("description" in body) department.description = str(body.description)?.trim() || null;
      if ("managerId" in body) {
        const managerId = str(body.managerId) ?? null;
        if (managerId) {
          const manager = findUser(managerId);
          if (!manager) throw new ApiError(404, "Manager not found.");
          manager.role = SystemRole.DEPARTMENT_MANAGER;
        }
        department.managerId = managerId;
      }
      if ("headId" in body) {
        const headId = str(body.headId) ?? null;
        if (headId) {
          const head = findUser(headId);
          if (!head) throw new ApiError(404, "Department Head not found.");
          head.role = SystemRole.DEPARTMENT_HEAD;
        }
        department.headId = headId;
      }
      return departmentListItem(department);
    },
  },

  // ── Teams ─────────────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/teams$/,
    handler: ({ query }) => {
      const departmentId = query.get("departmentId");
      return teams
        .filter((team) => !departmentId || team.departmentId === departmentId)
        .map(teamListItem);
    },
  },
  {
    method: "POST",
    regex: /^\/teams$/,
    handler: ({ body }) => {
      const departmentId = str(body.departmentId);
      const name = str(body.name)?.trim();
      const code = str(body.code)?.trim().toUpperCase();
      if (!departmentId || !name || !code) {
        throw new ApiError(400, "Department, name, and code are required.");
      }
      if (!findDepartment(departmentId)) throw new ApiError(404, "Department not found.");
      if (teams.some((team) => team.code === code)) {
        throw new ApiError(409, `A team with code ${code} already exists.`);
      }
      const teamLeadId = str(body.teamLeadId) ?? null;
      if (teamLeadId && !findUser(teamLeadId)) throw new ApiError(404, "Team lead not found.");
      const methodologyValue = str(body.methodology);

      const created: MockTeam = {
        id: newMockId(MOCK_ID_KIND.TEAM),
        departmentId,
        name,
        code,
        teamLeadId,
        capacityHoursPerWeek: num(body.capacityHoursPerWeek) ?? 40,
        methodology: (Object.values(ProjectMethodology) as string[]).includes(methodologyValue ?? "")
          ? (methodologyValue as ProjectMethodology)
          : ProjectMethodology.AGILE,
        isArchived: false,
        createdAt: nowIso(),
      };
      teams.push(created);

      // A named lead is implicitly a member of their own team.
      if (teamLeadId && !teamMembers.some((tm) => tm.teamId === created.id && tm.userId === teamLeadId)) {
        teamMembers.push({
          id: newMockId(MOCK_ID_KIND.TEAM_MEMBER),
          teamId: created.id,
          userId: teamLeadId,
          joinedAt: nowIso(),
        });
      }

      return teamListItem(created);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/teams/${SEG}/archive$`),
    handler: ({ params }) => {
      const team = findTeam(params[0]);
      if (!team) throw new ApiError(404, "Team not found.");
      team.isArchived = true;
      return teamListItem(team);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/teams/${SEG}/unarchive$`),
    handler: ({ params }) => {
      const team = findTeam(params[0]);
      if (!team) throw new ApiError(404, "Team not found.");
      team.isArchived = false;
      return teamListItem(team);
    },
  },
  {
    method: "POST",
    regex: new RegExp(`^/teams/${SEG}/members$`),
    handler: ({ params, body }) => {
      const team = findTeam(params[0]);
      if (!team) throw new ApiError(404, "Team not found.");
      const userId = str(body.userId);
      if (!userId) throw new ApiError(400, "userId is required.");
      if (!findUser(userId)) throw new ApiError(404, "Employee not found.");
      if (teamMembers.some((tm) => tm.teamId === team.id && tm.userId === userId)) {
        throw new ApiError(409, "This employee is already a member of the team.");
      }
      const created = {
        id: newMockId(MOCK_ID_KIND.TEAM_MEMBER),
        teamId: team.id,
        userId,
        joinedAt: nowIso(),
      };
      teamMembers.push(created);
      return teamDetail(team);
    },
  },
  {
    method: "DELETE",
    regex: new RegExp(`^/teams/${SEG}/members/${SEG}$`),
    handler: ({ params }) => {
      const team = findTeam(params[0]);
      if (!team) throw new ApiError(404, "Team not found.");
      const index = teamMembers.findIndex((tm) => tm.teamId === team.id && tm.userId === params[1]);
      if (index === -1) throw new ApiError(404, "This employee is not a member of the team.");
      teamMembers.splice(index, 1);
      return undefined;
    },
  },
  {
    // Purpose-built dashboard aggregate for the Development team workspace,
    // in the same spirit as `/reports/company`. Accepts `?days=30` for the
    // rolling window used by the bug trend and the "this month" counters.
    method: "GET",
    regex: new RegExp(`^/teams/${SEG}/dev-dashboard$`),
    handler: ({ params, query }) => {
      const team = findTeam(params[0]);
      if (!team) throw new ApiError(404, "Team not found.");

      const days = requireQueryInt(query, "days", 30);
      const windowStart = Date.now() - days * DAY_MS;

      const teamProjects = projects.filter((project) => project.teamId === team.id);
      const teamProjectIds = new Set(teamProjects.map((project) => project.id));
      const teamTasks = tasks.filter((task) => teamProjectIds.has(task.projectId));
      const completedTasks = teamTasks.filter((task) => task.status === TaskStatus.COMPLETED);
      const teamBugs = bugs.filter((item) => teamProjectIds.has(item.projectId));

      // ── Headline stats ────────────────────────────────────────────────────
      const activeProjects = teamProjects.filter(isActiveProject).length;
      const tasksInProgress = teamTasks.filter((task) => task.status === TaskStatus.IN_PROGRESS).length;
      const tasksCompleted = completedTasks.filter(
        (task) => new Date(task.updatedAt).getTime() >= windowStart,
      ).length;

      // A completed task counts as on time when it was last touched on or
      // before its due date. Tasks without a due date cannot be late.
      const onTime = completedTasks.filter(
        (task) => !task.dueDate || new Date(task.updatedAt).getTime() <= new Date(task.dueDate).getTime(),
      ).length;
      const onTimeDeliveryPct =
        completedTasks.length > 0 ? round1((onTime / completedTasks.length) * 100) : 0;

      const bugsInWindow = teamBugs.filter(
        (item) => new Date(item.createdAt).getTime() >= windowStart,
      );
      const utilizationPct = teamUtilizationPct(team.id);

      // ── Projects by status (present statuses only) ────────────────────────
      const projectsByStatus = (Object.values(ProjectStatus) as ProjectStatus[])
        .map((status) => ({
          status,
          count: teamProjects.filter((project) => project.status === status).length,
        }))
        .filter((row) => row.count > 0);

      // ── Active sprint progress ───────────────────────────────────────────
      const activeSprint = sprints.find(
        (sprint) => sprint.teamId === team.id && sprint.status === "ACTIVE",
      );
      let currentSprint: {
        name: string;
        daysLeft: number;
        totalTasks: number;
        completed: number;
        inProgress: number;
        todo: number;
        completionPct: number;
      } | null = null;

      if (activeSprint) {
        const sprintTasks = tasks.filter((task) => task.sprintId === activeSprint.id);
        const completed = sprintTasks.filter((task) => task.status === TaskStatus.COMPLETED).length;
        const inProgress = sprintTasks.filter((task) => task.status === TaskStatus.IN_PROGRESS).length;
        currentSprint = {
          name: activeSprint.name,
          daysLeft: Math.max(0, daysUntil(activeSprint.endDate)),
          totalTasks: sprintTasks.length,
          completed,
          inProgress,
          // Backlog + to do + review + testing, collapsed into one "not started
          // / not being worked on right now" bucket for the summary panel.
          todo: sprintTasks.length - completed - inProgress,
          completionPct: sprintTasks.length > 0 ? round1((completed / sprintTasks.length) * 100) : 0,
        };
      }

      // ── Tasks by priority (open work only, present priorities) ────────────
      const openTasks = teamTasks.filter((task) => task.status !== TaskStatus.COMPLETED);
      const tasksByPriority = (Object.values(Priority) as Priority[])
        .map((priority) => ({
          priority,
          count: openTasks.filter((task) => task.priority === priority).length,
        }))
        .filter((row) => row.count > 0);

      // ── Velocity (completed story points per sprint, oldest first) ────────
      const velocity = sprints
        .filter((sprint) => sprint.teamId === team.id)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((sprint) => ({
          sprintName: sprint.name,
          points: tasks
            .filter((task) => task.sprintId === sprint.id && task.status === TaskStatus.COMPLETED)
            .reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
        }));
      const averageVelocity =
        velocity.length > 0
          ? round1(velocity.reduce((sum, entry) => sum + entry.points, 0) / velocity.length)
          : 0;

      // ── Bugs over time (zero-filled, one row per day) ─────────────────────
      const bugsByDay = new Map<string, number>();
      for (const item of bugsInWindow) {
        const key = localDateKey(item.createdAt);
        bugsByDay.set(key, (bugsByDay.get(key) ?? 0) + 1);
      }
      const bugsOverTime = Array.from({ length: days }, (_, index) => {
        const date = dateOnly(-(days - 1 - index));
        return { date, count: bugsByDay.get(date) ?? 0 };
      });

      const resolvedBugs = bugsInWindow.filter((item) => !!item.resolvedAt).length;

      return {
        teamId: team.id,
        teamName: team.name,
        periodDays: days,
        stats: {
          activeProjects: devStat(activeProjects, [0.75, 0.75, 0.5, 0.75, 0.75, 1]),
          tasksInProgress: devStat(tasksInProgress, [0.5, 0.75, 0.5, 1.25, 0.75, 1]),
          tasksCompleted: devStat(tasksCompleted, [0.55, 0.62, 0.7, 0.78, 0.9, 1]),
          onTimeDeliveryPct: devStat(onTimeDeliveryPct, [0.93, 0.95, 0.94, 0.97, 0.98, 1]),
          bugsThisMonth: devStat(bugsInWindow.length, [1.3, 1.22, 1.15, 1.13, 1.05, 1]),
          teamUtilizationPct: devStat(utilizationPct, [0.9, 0.93, 0.95, 0.94, 0.97, 1]),
        },
        projectsByStatus,
        currentSprint,
        tasksByPriority,
        velocity,
        averageVelocity,
        bugsOverTime,
        bugSummary: {
          total: bugsInWindow.length,
          resolved: resolvedBugs,
          open: bugsInWindow.length - resolvedBugs,
        },
      };
    },
  },
  {
    // Sprint list for the Sprints tab of the Development view. Oldest first, so
    // the client can render the timeline in the order the sprints ran. Accepts
    // `?projectId=` to scope to one project's sprints (the Projects panel).
    method: "GET",
    regex: new RegExp(`^/teams/${SEG}/sprints$`),
    handler: ({ params, query }) => {
      const team = findTeam(params[0]);
      if (!team) throw new ApiError(404, "Team not found.");
      const projectId = query.get("projectId");

      let filtered = sprints.filter((sprint) => sprint.teamId === team.id);
      if (projectId) filtered = filtered.filter((sprint) => sprint.projectId === projectId);

      return filtered.sort((a, b) => a.startDate.localeCompare(b.startDate)).map(sprintRow);
    },
  },
  {
    // Raised from the Sprints tab's "Add Sprint" dialog, scoped to whichever
    // project the team lead has selected — same shape as the Bugs tab's
    // "Report Bug" dialog.
    method: "POST",
    regex: /^\/sprints$/,
    handler: ({ body }) => {
      const teamId = str(body.teamId);
      const projectId = str(body.projectId);
      const name = str(body.name)?.trim();
      const startDate = str(body.startDate);
      const endDate = str(body.endDate);
      if (!teamId || !projectId || !name || !startDate || !endDate) {
        throw new ApiError(400, "Team, project, name, start date and end date are required.");
      }
      if (!findTeam(teamId)) throw new ApiError(404, "Team not found.");
      if (!findProject(projectId)) {
        throw new ApiError(404, "Project not found — paste the id of an existing project.");
      }

      const created: MockSprint = {
        id: newMockId(MOCK_ID_KIND.SPRINT),
        teamId,
        projectId,
        name,
        goal: str(body.goal)?.trim() || "",
        startDate,
        endDate,
        status: "PLANNED",
        createdAt: nowIso(),
      };
      sprints.push(created);
      return sprintRow(created);
    },
  },
  {
    // Deleting a sprint doesn't delete its tasks — they move back to the
    // backlog (sprintId cleared) rather than disappearing.
    method: "DELETE",
    regex: new RegExp(`^/sprints/${SEG}$`),
    handler: ({ params }) => {
      const sprint = findSprint(params[0]);
      if (!sprint) throw new ApiError(404, "Sprint not found.");
      const index = sprints.indexOf(sprint);
      sprints.splice(index, 1);
      for (const task of tasks) {
        if (task.sprintId === sprint.id) task.sprintId = null;
      }
      return undefined;
    },
  },
  {
    // Bug list for the Bugs tab of the Development view — every defect raised
    // against one of the team's projects. Accepts `?status=&priority=&projectId=&page=&pageSize=`.
    method: "GET",
    regex: new RegExp(`^/teams/${SEG}/bugs$`),
    handler: ({ params, query }) => {
      const team = findTeam(params[0]);
      if (!team) throw new ApiError(404, "Team not found.");

      const page = requireQueryInt(query, "page", 1);
      const pageSize = requireQueryInt(query, "pageSize", 20);
      const status = query.get("status");
      const priority = query.get("priority");
      const projectId = query.get("projectId");

      const projectIds = teamProjectIdSet(team.id);
      let filtered = bugs.filter((item) => projectIds.has(item.projectId));
      if (status) filtered = filtered.filter((item) => item.status === status);
      if (priority) filtered = filtered.filter((item) => item.priority === priority);
      if (projectId) filtered = filtered.filter((item) => item.projectId === projectId);

      // Newest first — the same ordering the projects list uses.
      filtered = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return {
        data: paginate(filtered, page, pageSize).map(bugRow),
        total: filtered.length,
        page,
        pageSize,
      };
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/teams/${SEG}$`),
    handler: ({ params, body }) => {
      const team = findTeam(params[0]);
      if (!team) throw new ApiError(404, "Team not found.");
      const name = str(body.name)?.trim();
      if (name) team.name = name;
      if ("teamLeadId" in body) team.teamLeadId = str(body.teamLeadId) ?? null;
      const capacity = num(body.capacityHoursPerWeek);
      if (capacity !== undefined) team.capacityHoursPerWeek = capacity;
      const methodology = str(body.methodology);
      if (methodology && (Object.values(ProjectMethodology) as string[]).includes(methodology)) {
        team.methodology = methodology as ProjectMethodology;
      }
      return teamListItem(team);
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/teams/${SEG}$`),
    handler: ({ params }) => {
      const team = findTeam(params[0]);
      if (!team) throw new ApiError(404, "Team not found.");
      return teamDetail(team);
    },
  },

  // ── Employees ─────────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/employees$/,
    handler: ({ query }) => {
      const page = requireQueryInt(query, "page", 1);
      const pageSize = requireQueryInt(query, "pageSize", 20);
      const search = query.get("search")?.trim();
      const availability = query.get("availability");
      const teamId = query.get("teamId");
      const projectId = query.get("projectId");

      // Department Head is confined to their own department, regardless of
      // what a caller asks for — overrides rather than just defaults, so
      // scoping holds even from callers that don't know about this role.
      const requester = currentUser();
      const departmentId =
        requester.role === SystemRole.DEPARTMENT_HEAD
          ? requester.departmentId
          : query.get("departmentId");

      let filtered = users.filter((user) => user.isActive);
      if (departmentId) filtered = filtered.filter((user) => user.departmentId === departmentId);
      if (availability) filtered = filtered.filter((user) => user.availability === availability);
      if (teamId) {
        const memberIds = new Set(
          teamMembers.filter((tm) => tm.teamId === teamId).map((tm) => tm.userId),
        );
        filtered = filtered.filter((user) => memberIds.has(user.id));
      }
      if (projectId) {
        const project = findProject(projectId);
        if (!project) throw new ApiError(404, "Project not found.");
        // "On this project" = its owner, plus anyone assigned to one of its
        // tasks — there's no separate project-membership list in mock mode.
        const memberIds = new Set<string>([project.ownerId]);
        for (const task of tasks) {
          if (task.projectId === projectId) {
            for (const assigneeId of task.assigneeIds) memberIds.add(assigneeId);
          }
        }
        filtered = filtered.filter((user) => memberIds.has(user.id));
      }
      if (search) {
        filtered = filtered.filter(
          (user) => includesInsensitive(user.fullName, search) || includesInsensitive(user.email, search),
        );
      }

      const sorted = [...filtered].sort((a, b) => a.fullName.localeCompare(b.fullName));
      const total = sorted.length;

      return {
        data: paginate(sorted, page, pageSize).map(employeeListItem),
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    },
  },
  {
    method: "POST",
    regex: /^\/employees$/,
    handler: ({ body }) => {
      const fullName = str(body.fullName)?.trim();
      const email = str(body.email)?.trim();
      const password = str(body.password);
      if (!fullName || !email || !password) {
        throw new ApiError(400, "Full name, email, and password are required.");
      }
      if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
        throw new ApiError(409, "An account with that email already exists.");
      }
      const departmentId = str(body.departmentId) ?? null;
      if (departmentId && !findDepartment(departmentId)) {
        throw new ApiError(404, "Department not found.");
      }

      const roleValue = str(body.role);
      const role = (Object.values(SystemRole) as string[]).includes(roleValue ?? "")
        ? (roleValue as SystemRole)
        : SystemRole.EMPLOYEE;

      const created: MockUser = {
        id: newMockId(MOCK_ID_KIND.USER),
        fullName,
        email,
        role,
        // Designation is optional on the create form — default it to the
        // role's own label so the directory never shows a blank title.
        designation: str(body.designation)?.trim() || ROLE_DESIGNATION_LABEL[role],
        skills: strArray(body.skills) ?? [],
        availability: EmployeeAvailability.AVAILABLE,
        capacityHoursPerWeek: num(body.capacityHoursPerWeek) ?? 40,
        avatarUrl: null,
        departmentId,
        isActive: true,
        createdAt: nowIso(),
      };
      users.push(created);
      // Newly created people can sign in immediately with the password entered.
      MOCK_CREDENTIALS.push({ email: created.email, password, userId: created.id });

      return employeeProfile(created);
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/employees/${SEG}/work-history$`),
    handler: ({ params }) => {
      const user = findUser(params[0]);
      if (!user) throw new ApiError(404, "Employee not found.");

      const assignedTasks = tasks
        .filter((task) => task.assigneeIds.includes(user.id))
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
        .map((task) => {
          const project = findProject(task.projectId);
          return {
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            project: project ? { id: project.id, name: project.name, status: project.status } : null,
          };
        });

      const ownedProjects = projects
        .filter((project) => project.ownerId === user.id)
        .map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
          priority: project.priority,
          startDate: project.startDate,
          dueDate: project.dueDate,
          healthScore: project.healthScore,
        }));

      const cutoff = dateOnly(-90);
      const recentTimesheetEntries = timesheetEntries
        .filter((entry) => entry.employeeId === user.id && entry.date >= cutoff)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((entry) => ({
          id: entry.id,
          date: entry.date,
          hours: entry.hours,
          notes: entry.notes,
          status: entry.status,
        }));

      return { assignedTasks, ownedProjects, recentTimesheetEntries };
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/employees/${SEG}$`),
    handler: ({ params }) => {
      const user = findUser(params[0]);
      if (!user) throw new ApiError(404, "Employee not found.");
      const requester = currentUser();
      if (requester.role === SystemRole.DEPARTMENT_HEAD && user.departmentId !== requester.departmentId) {
        throw new ApiError(404, "Employee not found.");
      }
      return employeeProfile(user);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/employees/${SEG}$`),
    handler: ({ params, body }) => {
      const user = findUser(params[0]);
      if (!user) throw new ApiError(404, "Employee not found.");
      const requester = currentUser();
      if (requester.role === SystemRole.DEPARTMENT_HEAD && user.departmentId !== requester.departmentId) {
        throw new ApiError(404, "Employee not found.");
      }

      const fullName = str(body.fullName)?.trim();
      if (fullName) user.fullName = fullName;
      const skills = strArray(body.skills);
      if (skills) user.skills = skills;
      const availability = str(body.availability);
      if (availability && (Object.values(EmployeeAvailability) as string[]).includes(availability)) {
        user.availability = availability as EmployeeAvailability;
      }
      const capacity = num(body.capacityHoursPerWeek);
      if (capacity !== undefined) user.capacityHoursPerWeek = capacity;
      const role = str(body.role);
      if (role && (Object.values(SystemRole) as string[]).includes(role)) {
        user.role = role as SystemRole;
      }
      // Designation is optional — clearing it falls back to the (possibly
      // just-updated) role's own label rather than leaving it blank.
      if ("designation" in body) {
        user.designation = str(body.designation)?.trim() || ROLE_DESIGNATION_LABEL[user.role];
      }
      const departmentId = str(body.departmentId);
      if (departmentId) {
        if (!findDepartment(departmentId)) throw new ApiError(404, "Department not found.");
        user.departmentId = departmentId;
      }
      const email = str(body.email)?.trim().toLowerCase();
      if (email && email !== user.email.toLowerCase()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new ApiError(400, "Enter a valid email address.");
        }
        if (users.some((other) => other.id !== user.id && other.email.toLowerCase() === email)) {
          throw new ApiError(409, "Another employee already uses this email.");
        }
        user.email = email;
        const credential = MOCK_CREDENTIALS.find((item) => item.userId === user.id);
        if (credential) credential.email = email;
      }

      return employeeProfile(user);
    },
  },
  {
    method: "POST",
    regex: new RegExp(`^/employees/${SEG}/reset-password$`),
    handler: ({ params, body }) => {
      const user = findUser(params[0]);
      if (!user) throw new ApiError(404, "Employee not found.");
      const password = str(body.password);
      if (!password || password.length < 8) {
        throw new ApiError(400, "Password must be at least 8 characters.");
      }
      const credential = MOCK_CREDENTIALS.find((item) => item.userId === user.id);
      if (credential) {
        credential.password = password;
      } else {
        MOCK_CREDENTIALS.push({ email: user.email, password, userId: user.id });
      }
      return undefined;
    },
  },
  {
    method: "DELETE",
    regex: new RegExp(`^/employees/${SEG}$`),
    handler: ({ params }) => {
      const user = findUser(params[0]);
      if (!user) throw new ApiError(404, "Employee not found.");
      user.isActive = false;
      return undefined;
    },
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/projects$/,
    handler: ({ query }) => {
      const page = requireQueryInt(query, "page", 1);
      const pageSize = requireQueryInt(query, "pageSize", 20);
      const status = query.get("status");
      const priority = query.get("priority");
      const search = query.get("search")?.trim();
      const departmentId = query.get("departmentId");
      const teamId = query.get("teamId");

      const requester = currentUser();
      let filtered = canSeeAllProjects(requester.role)
        ? [...projects]
        : projects.filter((project) => isProjectVisibleTo(project, requester));
      if (status) filtered = filtered.filter((project) => project.status === status);
      if (priority) filtered = filtered.filter((project) => project.priority === priority);
      if (departmentId) filtered = filtered.filter((project) => project.departmentId === departmentId);
      if (teamId) filtered = filtered.filter((project) => project.teamId === teamId);
      if (search) {
        filtered = filtered.filter(
          (project) =>
            includesInsensitive(project.name, search) || includesInsensitive(project.description, search),
        );
      }

      filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return {
        data: paginate(filtered, page, pageSize).map(projectListItem),
        total: filtered.length,
        page,
        pageSize,
      };
    },
  },
  {
    method: "POST",
    regex: /^\/projects$/,
    handler: ({ body }) => {
      const requester = currentUser();
      if (!isDepartmentLevel(requester.role)) {
        throw new ApiError(403, "Only Department Heads and above can create projects.");
      }
      const departmentId = str(body.departmentId);
      const name = str(body.name)?.trim();
      const ownerId = str(body.ownerId);
      if (!departmentId || !name || !ownerId) {
        throw new ApiError(400, "Department, name, and owner are required.");
      }
      // Department Head is confined to their own department's projects.
      if (requester.role === SystemRole.DEPARTMENT_HEAD && departmentId !== requester.departmentId) {
        throw new ApiError(403, "You can only create projects within your own department.");
      }
      if (!findDepartment(departmentId)) throw new ApiError(404, "Department not found.");
      if (!findUser(ownerId)) {
        throw new ApiError(404, "Owner not found — paste the id of an existing employee.");
      }
      const teamId = str(body.teamId) ?? null;
      if (teamId && !findTeam(teamId)) throw new ApiError(404, "Team not found.");

      const statusValue = str(body.status);
      const priorityValue = str(body.priority);

      const created: MockProject = {
        id: newMockId(MOCK_ID_KIND.PROJECT),
        departmentId,
        teamId,
        name,
        description: str(body.description)?.trim() || null,
        status: (Object.values(ProjectStatus) as string[]).includes(statusValue ?? "")
          ? (statusValue as ProjectStatus)
          : ProjectStatus.PLANNING,
        priority: (Object.values(Priority) as string[]).includes(priorityValue ?? "")
          ? (priorityValue as Priority)
          : Priority.MEDIUM,
        startDate: str(body.startDate) ?? null,
        dueDate: str(body.dueDate) ?? null,
        healthScore: num(body.healthScore) ?? 75,
        ownerId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      projects.push(created);
      notifyEmployees(
        [created.ownerId],
        NotificationType.PROJECT_UPDATE,
        `You were made owner of “${created.name}”`,
        `${currentUser().fullName} created this project and assigned you as owner.`,
        "/projects",
      );
      return projectDetail(created);
    },
  },
  {
    method: "POST",
    regex: new RegExp(`^/projects/${SEG}/milestones$`),
    handler: ({ params, body }) => {
      const project = findProject(params[0]);
      if (!project) throw new ApiError(404, "Project not found.");
      const name = str(body.name)?.trim();
      if (!name) throw new ApiError(400, "Milestone name is required.");

      const created: MockMilestone = {
        id: newMockId(MOCK_ID_KIND.MILESTONE),
        projectId: project.id,
        name,
        dueDate: str(body.dueDate) ?? null,
        isCompleted: bool(body.isCompleted) ?? false,
        createdAt: nowIso(),
      };
      milestones.push(created);
      return milestoneDto(created);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/projects/${SEG}/milestones/${SEG}$`),
    handler: ({ params, body }) => {
      const project = findProject(params[0]);
      if (!project) throw new ApiError(404, "Project not found.");
      const target = milestones.find((m) => m.id === params[1] && m.projectId === project.id);
      if (!target) throw new ApiError(404, "Milestone not found.");

      const name = str(body.name)?.trim();
      if (name) target.name = name;
      if ("dueDate" in body) target.dueDate = str(body.dueDate) ?? null;
      const isCompleted = bool(body.isCompleted);
      if (isCompleted !== undefined) target.isCompleted = isCompleted;

      return milestoneDto(target);
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/projects/${SEG}$`),
    handler: ({ params }) => {
      const project = findProject(params[0]);
      if (!project) throw new ApiError(404, "Project not found.");
      if (!isProjectVisibleTo(project, currentUser())) throw new ApiError(404, "Project not found.");
      return projectDetail(project);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/projects/${SEG}$`),
    handler: ({ params, body }) => {
      const project = findProject(params[0]);
      if (!project) throw new ApiError(404, "Project not found.");

      const departmentId = str(body.departmentId);
      if (departmentId) {
        if (!findDepartment(departmentId)) throw new ApiError(404, "Department not found.");
        project.departmentId = departmentId;
      }
      if ("teamId" in body) {
        const teamId = str(body.teamId) ?? null;
        if (teamId && !findTeam(teamId)) throw new ApiError(404, "Team not found.");
        project.teamId = teamId;
      }
      const name = str(body.name)?.trim();
      if (name) project.name = name;
      if ("description" in body) project.description = str(body.description)?.trim() || null;
      const status = str(body.status);
      if (status && (Object.values(ProjectStatus) as string[]).includes(status)) {
        project.status = status as ProjectStatus;
      }
      const priority = str(body.priority);
      if (priority && (Object.values(Priority) as string[]).includes(priority)) {
        project.priority = priority as Priority;
      }
      if ("startDate" in body) project.startDate = str(body.startDate) ?? null;
      if ("dueDate" in body) project.dueDate = str(body.dueDate) ?? null;
      const healthScore = num(body.healthScore);
      if (healthScore !== undefined) project.healthScore = healthScore;
      const ownerId = str(body.ownerId);
      if (ownerId && ownerId !== project.ownerId) {
        if (!findUser(ownerId)) {
          throw new ApiError(404, "Owner not found — paste the id of an existing employee.");
        }
        project.ownerId = ownerId;
        notifyEmployees(
          [ownerId],
          NotificationType.PROJECT_UPDATE,
          `You were made owner of “${project.name}”`,
          `${currentUser().fullName} assigned you as the owner of this project.`,
          "/projects",
        );
      }
      project.updatedAt = nowIso();

      return projectDetail(project);
    },
  },
  {
    method: "DELETE",
    regex: new RegExp(`^/projects/${SEG}$`),
    handler: ({ params }) => {
      const project = findProject(params[0]);
      if (!project) throw new ApiError(404, "Project not found.");
      // Matches the real API: cancelling is a soft action, not a hard delete.
      project.status = ProjectStatus.CANCELLED;
      project.updatedAt = nowIso();
      return undefined;
    },
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/tasks$/,
    handler: ({ query }) => {
      const page = requireQueryInt(query, "page", 1);
      const pageSize = requireQueryInt(query, "pageSize", 20);
      const assigneeId = query.get("assigneeId");
      const status = query.get("status");
      const priority = query.get("priority");
      const search = query.get("search")?.trim();
      const projectId = query.get("projectId");
      const milestoneId = query.get("milestoneId");
      const sprintId = query.get("sprintId");

      let filtered = [...tasks];
      if (projectId) filtered = filtered.filter((task) => task.projectId === projectId);
      if (milestoneId) filtered = filtered.filter((task) => task.milestoneId === milestoneId);
      if (sprintId) filtered = filtered.filter((task) => task.sprintId === sprintId);
      if (assigneeId) filtered = filtered.filter((task) => task.assigneeIds.includes(assigneeId));
      if (status) filtered = filtered.filter((task) => task.status === status);
      if (priority) filtered = filtered.filter((task) => task.priority === priority);
      if (search) {
        filtered = filtered.filter(
          (task) => includesInsensitive(task.title, search) || includesInsensitive(task.description, search),
        );
      }

      const total = filtered.length;
      return {
        data: paginate(filtered, page, pageSize).map(taskListItem),
        meta: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    },
  },
  {
    method: "POST",
    regex: /^\/tasks$/,
    handler: ({ body }) => {
      const projectId = str(body.projectId);
      const title = str(body.title)?.trim();
      if (!projectId || !title) throw new ApiError(400, "Project and title are required.");
      if (!findProject(projectId)) {
        throw new ApiError(404, "Project not found — paste the id of an existing project.");
      }
      const parentTaskId = str(body.parentTaskId) ?? null;
      if (parentTaskId && !findTask(parentTaskId)) throw new ApiError(404, "Parent task not found.");

      const statusValue = str(body.status);
      const priorityValue = str(body.priority);

      const created: MockTask = {
        id: newMockId(MOCK_ID_KIND.TASK),
        projectId,
        milestoneId: str(body.milestoneId) ?? null,
        parentTaskId,
        title,
        description: str(body.description)?.trim() || null,
        status: (Object.values(TaskStatus) as string[]).includes(statusValue ?? "")
          ? (statusValue as TaskStatus)
          : TaskStatus.BACKLOG,
        priority: (Object.values(Priority) as string[]).includes(priorityValue ?? "")
          ? (priorityValue as Priority)
          : Priority.MEDIUM,
        assigneeIds: (strArray(body.assigneeIds) ?? []).filter((id) => !!findUser(id)),
        watcherIds: (strArray(body.watcherIds) ?? []).filter((id) => !!findUser(id)),
        dependencyIds: strArray(body.dependencyIds) ?? [],
        dueDate: str(body.dueDate) ?? null,
        estimatedHours: num(body.estimatedHours) ?? null,
        isRecurring: bool(body.isRecurring) ?? false,
        // Sprint planning and point estimation are not exposed by the task
        // form yet — the Development Dashboard's fixtures set these directly.
        sprintId: str(body.sprintId) ?? null,
        storyPoints: num(body.storyPoints) ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      tasks.push(created);
      notifyEmployees(
        created.assigneeIds,
        NotificationType.TASK_UPDATE,
        `You were assigned to “${created.title}”`,
        `${currentUser().fullName} assigned you when creating this task.`,
        "/tasks",
      );
      return taskDetail(created);
    },
  },
  {
    method: "POST",
    regex: new RegExp(`^/tasks/${SEG}/assignees$`),
    handler: ({ params, body }) => {
      const task = findTask(params[0]);
      if (!task) throw new ApiError(404, "Task not found.");
      const userId = str(body.userId);
      if (!userId) throw new ApiError(400, "userId is required.");
      const user = findUser(userId);
      if (!user) throw new ApiError(404, "Employee not found — paste the id of an existing employee.");
      if (task.assigneeIds.includes(userId)) {
        throw new ApiError(409, "That employee is already assigned to this task.");
      }

      task.assigneeIds.push(userId);
      task.updatedAt = nowIso();
      taskActivityEntries.push({
        id: newMockId(MOCK_ID_KIND.ACTIVITY),
        taskId: task.id,
        actorId: currentUser().id,
        field: "assignee",
        oldValue: null,
        newValue: user.fullName,
        createdAt: nowIso(),
      });
      pushNotification(
        userId,
        NotificationType.TASK_UPDATE,
        `You were assigned to “${task.title}”`,
        `${currentUser().fullName} added you as an assignee.`,
        "/tasks",
      );

      return taskDetail(task);
    },
  },
  {
    method: "POST",
    regex: new RegExp(`^/tasks/${SEG}/comments$`),
    handler: ({ params, body }) => {
      const task = findTask(params[0]);
      if (!task) throw new ApiError(404, "Task not found.");
      const text = str(body.body)?.trim();
      if (!text) throw new ApiError(400, "Comment body is required.");

      const author = currentUser();
      const created = {
        id: newMockId(MOCK_ID_KIND.COMMENT),
        taskId: task.id,
        authorId: author.id,
        body: text,
        createdAt: nowIso(),
      };
      taskComments.push(created);

      return { ...created, author: userSummary(author.id) };
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/tasks/${SEG}$`),
    handler: ({ params }) => {
      const task = findTask(params[0]);
      if (!task) throw new ApiError(404, "Task not found.");
      return taskDetail(task);
    },
  },
  {
    // Starts the work timer — only while the task is actively In Progress, so
    // the option only ever appears there in the UI too.
    method: "POST",
    regex: new RegExp(`^/tasks/${SEG}/timer/start$`),
    handler: ({ params }) => {
      const task = findTask(params[0]);
      if (!task) throw new ApiError(404, "Task not found.");
      if (task.status !== TaskStatus.IN_PROGRESS) {
        throw new ApiError(400, "Set the task to In Progress before starting the timer.");
      }
      if (task.activeTimerStartedAt) throw new ApiError(400, "The timer is already running.");
      task.activeTimerStartedAt = nowIso();
      return taskDetail(task);
    },
  },
  {
    method: "POST",
    regex: new RegExp(`^/tasks/${SEG}/timer/stop$`),
    handler: ({ params }) => {
      const task = findTask(params[0]);
      if (!task) throw new ApiError(404, "Task not found.");
      if (!task.activeTimerStartedAt) throw new ApiError(400, "The timer is not running.");
      stopTaskTimer(task);
      return taskDetail(task);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/tasks/${SEG}$`),
    handler: ({ params, body }) => {
      const task = findTask(params[0]);
      if (!task) throw new ApiError(404, "Task not found.");
      const actorId = currentUser().id;

      const logChange = (field: string, oldValue: string | null, newValue: string | null) => {
        taskActivityEntries.push({
          id: newMockId(MOCK_ID_KIND.ACTIVITY),
          taskId: task.id,
          actorId,
          field,
          oldValue,
          newValue,
          createdAt: nowIso(),
        });
      };

      const status = str(body.status);
      if (status && (Object.values(TaskStatus) as string[]).includes(status) && status !== task.status) {
        logChange("status", task.status, status);
        task.status = status as TaskStatus;
        // Completing the parent completes its subtasks too — they don't make
        // sense left open once the task they belong to is done.
        if (task.status === TaskStatus.COMPLETED) {
          for (const subtask of tasks) {
            if (subtask.parentTaskId === task.id && subtask.status !== TaskStatus.COMPLETED) {
              subtask.status = TaskStatus.COMPLETED;
              subtask.updatedAt = nowIso();
            }
          }
        }
        // The work timer only makes sense while actively In Progress — leaving
        // that status auto-stops and banks it rather than losing the minutes.
        if (task.status !== TaskStatus.IN_PROGRESS) {
          stopTaskTimer(task);
        }
      }
      const priority = str(body.priority);
      if (
        priority &&
        (Object.values(Priority) as string[]).includes(priority) &&
        priority !== task.priority
      ) {
        logChange("priority", task.priority, priority);
        task.priority = priority as Priority;
      }
      const title = str(body.title)?.trim();
      if (title && title !== task.title) {
        logChange("title", task.title, title);
        task.title = title;
      }
      if ("description" in body) task.description = str(body.description)?.trim() || null;
      if ("dueDate" in body) {
        const dueDate = str(body.dueDate) ?? null;
        if (dueDate !== task.dueDate) logChange("dueDate", task.dueDate, dueDate);
        task.dueDate = dueDate;
      }
      if ("milestoneId" in body) task.milestoneId = str(body.milestoneId) ?? null;
      const estimatedHours = num(body.estimatedHours);
      if (estimatedHours !== undefined) task.estimatedHours = estimatedHours;
      if ("sprintId" in body) {
        const sprintId = str(body.sprintId) ?? null;
        if (sprintId && !findSprint(sprintId)) throw new ApiError(404, "Sprint not found.");
        task.sprintId = sprintId;
      }
      const storyPoints = num(body.storyPoints);
      if (storyPoints !== undefined) task.storyPoints = storyPoints;
      const assigneeIds = strArray(body.assigneeIds);
      if (assigneeIds) {
        const previousAssigneeIds = new Set(task.assigneeIds);
        task.assigneeIds = assigneeIds.filter((id) => !!findUser(id));
        const newlyAssignedIds = task.assigneeIds.filter((id) => !previousAssigneeIds.has(id));
        notifyEmployees(
          newlyAssignedIds,
          NotificationType.TASK_UPDATE,
          `You were assigned to “${task.title}”`,
          `${currentUser().fullName} added you as an assignee.`,
          "/tasks",
        );
      }
      const watcherIds = strArray(body.watcherIds);
      if (watcherIds) task.watcherIds = watcherIds.filter((id) => !!findUser(id));
      const isRecurring = bool(body.isRecurring);
      if (isRecurring !== undefined) task.isRecurring = isRecurring;

      task.updatedAt = nowIso();
      return taskDetail(task);
    },
  },

  // ── Bugs ──────────────────────────────────────────────────────────────────
  {
    // Raised from the Bugs tab's "Report Bug" dialog. The reporter is always the
    // signed-in persona, matching how `/timesheets` and `/tasks/:id/comments`
    // attribute their writes.
    method: "POST",
    regex: /^\/bugs$/,
    handler: ({ body }) => {
      const projectId = str(body.projectId);
      const title = str(body.title)?.trim();
      if (!projectId || !title) throw new ApiError(400, "Project and title are required.");
      if (!findProject(projectId)) {
        throw new ApiError(404, "Project not found — paste the id of an existing project.");
      }

      const priorityValue = str(body.priority);
      const created: MockBug = {
        id: newMockId(MOCK_ID_KIND.BUG),
        projectId,
        taskId: null,
        title,
        description: str(body.description)?.trim() || null,
        priority: (Object.values(Priority) as string[]).includes(priorityValue ?? "")
          ? (priorityValue as Priority)
          : Priority.MEDIUM,
        status: "NEW",
        reportedById: currentUser().id,
        assigneeId: null,
        screenshotUrl: str(body.screenshotUrl) ?? null,
        createdAt: nowIso(),
        resolvedAt: null,
      };
      bugs.push(created);
      return bugRow(created);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/bugs/${SEG}$`),
    handler: ({ params, body }) => {
      const bugRecord = findBug(params[0]);
      if (!bugRecord) throw new ApiError(404, "Bug not found.");

      const status = str(body.status);
      if (status && (BUG_STATUSES as string[]).includes(status) && status !== bugRecord.status) {
        // Backfill a seed entry for the status it's leaving *before* overwriting,
        // so the synthetic history (for bugs with no real log yet) reflects what
        // the bug actually was, not the state it's about to become.
        bugRecord.statusHistory = bugRecord.statusHistory ?? [
          {
            id: `${bugRecord.id}-seed`,
            status: bugRecord.status,
            changedById: bugRecord.reportedById,
            changedAt: bugRecord.createdAt,
          },
        ];
        bugRecord.status = status as MockBugStatus;
        // Keep `resolvedAt` consistent with the workflow state, so the dashboard's
        // resolved/open split stays correct after an inline status change.
        if (RESOLVED_BUG_STATUSES.includes(bugRecord.status)) {
          bugRecord.resolvedAt = bugRecord.resolvedAt ?? nowIso();
        } else {
          bugRecord.resolvedAt = null;
        }
        // Record who moved it and when — the bug detail panel's status timeline
        // is built entirely from this log, so every transition must append one.
        bugRecord.statusHistory.push({
          id: `${bugRecord.id}-h${bugRecord.statusHistory.length}`,
          status: bugRecord.status,
          changedById: currentUser().id,
          changedAt: nowIso(),
        });
      }

      const priority = str(body.priority);
      if (priority && (Object.values(Priority) as string[]).includes(priority)) {
        bugRecord.priority = priority as Priority;
      }

      if ("assigneeId" in body) {
        const assigneeId = str(body.assigneeId) ?? null;
        if (assigneeId && !findUser(assigneeId)) {
          throw new ApiError(404, "Employee not found — paste the id of an existing employee.");
        }
        bugRecord.assigneeId = assigneeId;
      }

      return bugRow(bugRecord);
    },
  },
  {
    // Single defect, for the bug detail slide-over. Same `bugRow` shape the
    // list endpoint returns, so the panel and the board share one type.
    method: "GET",
    regex: new RegExp(`^/bugs/${SEG}$`),
    handler: ({ params }) => {
      const bugRecord = findBug(params[0]);
      if (!bugRecord) throw new ApiError(404, "Bug not found.");
      return bugRow(bugRecord);
    },
  },

  // ── Workload ──────────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/workload\/employees$/,
    handler: ({ query }) =>
      workloadScope(query)
        .map(workloadSummary)
        .sort((a, b) => b.utilizationPct - a.utilizationPct),
  },
  {
    method: "GET",
    regex: /^\/workload\/overloaded$/,
    handler: ({ query }) =>
      workloadScope(query)
        .map(workloadSummary)
        .filter((item) => item.status === "OVERLOADED")
        .sort((a, b) => b.utilizationPct - a.utilizationPct),
  },
  {
    method: "GET",
    regex: /^\/workload\/underutilized$/,
    handler: ({ query }) =>
      workloadScope(query)
        .map(workloadSummary)
        .filter((item) => item.status === "UNDERUTILIZED")
        .sort((a, b) => a.utilizationPct - b.utilizationPct),
  },
  {
    method: "GET",
    regex: new RegExp(`^/workload/departments/${SEG}$`),
    handler: ({ params }) => {
      const department = findDepartment(params[0]);
      if (!department) throw new ApiError(404, "Department not found.");
      const scoped = users.filter(
        (user) =>
          user.isActive && RESOURCED_ROLES.includes(user.role) && user.departmentId === department.id,
      );
      const totalCapacityHours = scoped.reduce((sum, user) => sum + user.capacityHoursPerWeek, 0);
      const totalAllocatedHours = scoped.reduce((sum, user) => sum + allocatedHoursFor(user.id), 0);

      return {
        departmentId: department.id,
        departmentName: department.name,
        totalCapacityHours,
        totalAllocatedHours,
        utilizationPct:
          totalCapacityHours > 0
            ? Math.round((totalAllocatedHours / totalCapacityHours) * 1000) / 10
            : 0,
        employeeCount: scoped.length,
      };
    },
  },

  // ── Timesheets ────────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/timesheets$/,
    handler: ({ query }) => {
      const requester = currentUser();
      const projectId = query.get("projectId");
      const explicitEmployeeId = query.get("employeeId");
      // No projectId → the classic "my timesheet" call, defaults to self.
      // A projectId with no employeeId means "everyone on this project" —
      // the Team Timesheets view — which only Team Lead-and-above may ask
      // for; anyone can still ask for their own id explicitly.
      const employeeId = explicitEmployeeId ?? (projectId ? null : requester.id);
      if (
        (employeeId === null || employeeId !== requester.id) &&
        !isDepartmentLevel(requester.role) &&
        requester.role !== SystemRole.TEAM_LEAD
      ) {
        throw new ApiError(403, "You can only view your own timesheet.");
      }
      const dateFrom = query.get("dateFrom");
      const dateTo = query.get("dateTo");
      const status = query.get("status");

      return timesheetEntries
        .filter((entry) => !employeeId || entry.employeeId === employeeId)
        .filter((entry) => !projectId || entry.projectId === projectId)
        .filter((entry) => !dateFrom || entry.date >= dateFrom)
        .filter((entry) => !dateTo || entry.date <= dateTo)
        .filter((entry) => !status || entry.status === status)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(timesheetDto);
    },
  },
  {
    method: "POST",
    regex: /^\/timesheets$/,
    handler: ({ body }) => {
      const date = str(body.date);
      const hours = num(body.hours);
      if (!date || hours === undefined) throw new ApiError(400, "Date and hours are required.");

      const projectId = str(body.projectId) ?? null;
      const taskId = str(body.taskId) ?? null;
      if (projectId && !findProject(projectId)) throw new ApiError(404, "Project not found.");
      if (taskId && !findTask(taskId)) throw new ApiError(404, "Task not found.");

      const created: MockTimesheetEntry = {
        id: newMockId(MOCK_ID_KIND.TIMESHEET),
        employeeId: currentUser().id,
        taskId,
        // Derive the project from the task when only a task was supplied.
        projectId: projectId ?? findTask(taskId)?.projectId ?? null,
        date,
        hours,
        notes: str(body.notes)?.trim() || null,
        status: TimesheetStatus.SUBMITTED,
        createdAt: nowIso(),
      };
      timesheetEntries.push(created);
      return timesheetDto(created);
    },
  },
  {
    method: "POST",
    regex: new RegExp(`^/timesheets/${SEG}/submit-for-approval$`),
    handler: ({ params }) => {
      const entry = timesheetEntries.find((item) => item.id === params[0]);
      if (!entry) throw new ApiError(404, "Timesheet entry not found.");
      if (entry.status !== TimesheetStatus.SUBMITTED) {
        throw new ApiError(400, "Only submitted entries can be sent for approval.");
      }

      entry.status = TimesheetStatus.PENDING_APPROVAL;

      const requester = findUser(entry.employeeId);
      const approval: MockApprovalRequest = {
        id: newMockId(MOCK_ID_KIND.APPROVAL),
        type: ApprovalType.TIMESHEET,
        status: ApprovalStatus.PENDING,
        requesterId: entry.employeeId,
        approverId: null,
        entityId: entry.id,
        entityLabel: `Timesheet — ${entry.hours}h on ${entry.date}`,
        projectId: entry.projectId,
        comment: null,
        submittedAt: nowIso(),
        decidedAt: null,
        createdAt: nowIso(),
      };
      approvalRequests.push(approval);

      // Notify the department manager so the request is visible somewhere.
      const department = findDepartment(requester?.departmentId);
      if (department?.managerId && department.managerId !== entry.employeeId) {
        pushNotification(
          department.managerId,
          NotificationType.APPROVAL_REQUEST,
          `${requester?.fullName ?? "An employee"} submitted a timesheet for approval`,
          approval.entityLabel,
          "/approvals",
        );
      }

      return timesheetDto(entry);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/timesheets/${SEG}$`),
    handler: ({ params, body }) => {
      const entry = timesheetEntries.find((item) => item.id === params[0]);
      if (!entry) throw new ApiError(404, "Timesheet entry not found.");

      const date = str(body.date);
      if (date) entry.date = date;
      const hours = num(body.hours);
      if (hours !== undefined) entry.hours = hours;
      if ("notes" in body) entry.notes = str(body.notes)?.trim() || null;

      return timesheetDto(entry);
    },
  },
  {
    method: "DELETE",
    regex: new RegExp(`^/timesheets/${SEG}$`),
    handler: ({ params }) => {
      const index = timesheetEntries.findIndex((item) => item.id === params[0]);
      if (index === -1) throw new ApiError(404, "Timesheet entry not found.");
      timesheetEntries.splice(index, 1);
      return undefined;
    },
  },

  // ── Approvals ─────────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/approvals$/,
    handler: ({ query }) => {
      const requesterId = query.get("requesterId");
      const pendingForMe = query.get("pendingForMe") === "true";
      const type = query.get("type");
      const status = query.get("status");

      let filtered = [...approvalRequests];

      if (pendingForMe) {
        const reviewer = currentUser();
        filtered = filtered.filter(
          (approval) =>
            OPEN_APPROVAL_STATUSES.includes(approval.status) &&
            approval.requesterId !== reviewer.id &&
            canReviewFor(reviewer, approval),
        );
      }
      if (requesterId) filtered = filtered.filter((approval) => approval.requesterId === requesterId);
      if (type) filtered = filtered.filter((approval) => approval.type === type);
      if (status) filtered = filtered.filter((approval) => approval.status === status);

      return filtered
        .sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt))
        .map(approvalDto);
    },
  },
  {
    method: "POST",
    regex: /^\/approvals$/,
    handler: ({ body }) => {
      const typeValue = str(body.type);
      if (!typeValue || !(Object.values(ApprovalType) as string[]).includes(typeValue)) {
        throw new ApiError(400, "A valid approval type is required.");
      }
      const entityLabel = str(body.entityLabel)?.trim();
      if (!entityLabel) throw new ApiError(400, "Entity label is required.");

      const type = typeValue as ApprovalType;
      const projectId = str(body.projectId)?.trim() || null;
      if (type === ApprovalType.PROJECT) {
        if (!projectId) throw new ApiError(400, "Project ID is required for PROJECT approvals.");
        if (!findProject(projectId)) {
          throw new ApiError(404, "Project not found — paste the id of an existing project.");
        }
      } else if (projectId && !findProject(projectId)) {
        throw new ApiError(404, "Project not found.");
      }

      const requester = currentUser();
      const created: MockApprovalRequest = {
        id: newMockId(MOCK_ID_KIND.APPROVAL),
        type,
        status: ApprovalStatus.PENDING,
        requesterId: requester.id,
        approverId: null,
        entityId: projectId ?? newMockId(MOCK_ID_KIND.APPROVAL),
        entityLabel,
        projectId,
        comment: str(body.comment)?.trim() || null,
        submittedAt: nowIso(),
        decidedAt: null,
        createdAt: nowIso(),
      };
      approvalRequests.push(created);

      const department = findDepartment(requester.departmentId);
      if (department?.managerId && department.managerId !== requester.id) {
        pushNotification(
          department.managerId,
          NotificationType.APPROVAL_REQUEST,
          `${requester.fullName} submitted a ${type} request`,
          entityLabel,
          "/approvals",
        );
      }

      return approvalDto(created);
    },
  },
  {
    method: "POST",
    regex: new RegExp(`^/approvals/${SEG}/approve$`),
    handler: ({ params, body }) =>
      decideApproval(params[0], ApprovalStatus.APPROVED, str(body.comment)?.trim() || undefined),
  },
  {
    method: "POST",
    regex: new RegExp(`^/approvals/${SEG}/reject$`),
    handler: ({ params, body }) => {
      const comment = str(body.comment)?.trim();
      if (!comment) throw new ApiError(400, "A comment is required to reject a request.");
      return decideApproval(params[0], ApprovalStatus.REJECTED, comment);
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/approvals/${SEG}$`),
    handler: ({ params }) => {
      const approval = approvalRequests.find((item) => item.id === params[0]);
      if (!approval) throw new ApiError(404, "Approval request not found.");
      return approvalDto(approval);
    },
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/notifications$/,
    handler: ({ query }) => {
      const user = currentUser();
      const unreadOnly = query.get("unreadOnly") === "true";
      return notifications
        .filter((notification) => notification.userId === user.id)
        .filter((notification) => !unreadOnly || !notification.isRead)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  },
  {
    method: "PATCH",
    regex: /^\/notifications\/read-all$/,
    handler: () => {
      const user = currentUser();
      let updated = 0;
      for (const notification of notifications) {
        if (notification.userId === user.id && !notification.isRead) {
          notification.isRead = true;
          updated += 1;
        }
      }
      return { updated };
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/notifications/${SEG}/read$`),
    handler: ({ params }) => {
      const notification = notifications.find((item) => item.id === params[0]);
      if (!notification) throw new ApiError(404, "Notification not found.");
      notification.isRead = true;
      return notification;
    },
  },

  // ── Credentials (org-wide access vault, optionally linked to a project) ──────
  {
    method: "GET",
    regex: /^\/credentials$/,
    handler: ({ query }) => {
      // projectId is just an optional filter now — omit it to see every
      // credential you have visibility into, across all projects.
      const projectId = query.get("projectId");
      if (projectId && !findProject(projectId)) throw new ApiError(404, "Project not found.");
      const requester = currentUser();
      return credentials
        .filter((credential) => !projectId || credential.projectId === projectId)
        .filter((credential) => isCredentialVisibleTo(credential, requester))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(credentialDto);
    },
  },
  {
    method: "POST",
    regex: /^\/credentials$/,
    handler: ({ body }) => {
      const requester = currentUser();
      if (!canCreateCredentials(requester.role)) {
        throw new ApiError(403, "Only Team Leads and above can add credentials.");
      }
      const label = str(body.label)?.trim();
      if (!label) throw new ApiError(400, "Label is required.");
      const projectId = str(body.projectId) || null;
      const project = projectId ? findProject(projectId) : null;
      if (projectId && !project) throw new ApiError(404, "Project not found.");
      if (requester.role === SystemRole.DEPARTMENT_HEAD) {
        // Department Head is department-scoped everywhere else, so a
        // project-less (org-wide-visible) credential would bypass that —
        // they must attach it to a project in their own department.
        if (!project) throw new ApiError(400, "Department Heads must link a credential to a project.");
        if (project.departmentId !== requester.departmentId) {
          throw new ApiError(403, "You can only add credentials for projects in your own department.");
        }
      }
      const categoryValue = str(body.category);
      const category = (Object.values(CredentialCategory) as string[]).includes(categoryValue ?? "")
        ? (categoryValue as CredentialCategory)
        : CredentialCategory.OTHER;
      const sharedWithUserIds = (strArray(body.sharedWithUserIds) ?? []).filter((id) => !!findUser(id));

      const created: MockProjectCredential = {
        id: newMockId(MOCK_ID_KIND.CREDENTIAL),
        projectId,
        label,
        category,
        username: str(body.username)?.trim() || null,
        password: str(body.password) ?? "",
        url: str(body.url)?.trim() || null,
        notes: str(body.notes)?.trim() || null,
        sharedWithUserIds,
        createdById: requester.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      credentials.push(created);
      notifyEmployees(
        created.sharedWithUserIds,
        NotificationType.TEAM_ANNOUNCEMENT,
        `You were given access to “${created.label}”`,
        `${requester.fullName} shared a credential with you.`,
        "/credentials",
      );
      return credentialDto(created);
    },
  },
  {
    method: "PATCH",
    regex: new RegExp(`^/credentials/${SEG}$`),
    handler: ({ params, body }) => {
      const credential = credentials.find((item) => item.id === params[0]);
      if (!credential) throw new ApiError(404, "Credential not found.");
      const requester = currentUser();
      // Team Lead (and anyone else below the admin tier) can only ever edit
      // credentials they personally created — see `canManageAnyCredential`.
      if (!canManageAnyCredential(requester.role) && credential.createdById !== requester.id) {
        throw new ApiError(403, "You don't have permission to edit this credential.");
      }

      const label = str(body.label)?.trim();
      if (label) credential.label = label;
      if ("projectId" in body) {
        const projectId = str(body.projectId) || null;
        if (projectId && !findProject(projectId)) throw new ApiError(404, "Project not found.");
        credential.projectId = projectId;
      }
      if ("category" in body) {
        const categoryValue = str(body.category);
        if (categoryValue && (Object.values(CredentialCategory) as string[]).includes(categoryValue)) {
          credential.category = categoryValue as CredentialCategory;
        }
      }
      if ("username" in body) credential.username = str(body.username)?.trim() || null;
      if ("password" in body) credential.password = str(body.password) ?? credential.password;
      if ("url" in body) credential.url = str(body.url)?.trim() || null;
      if ("notes" in body) credential.notes = str(body.notes)?.trim() || null;
      if ("sharedWithUserIds" in body) {
        const previouslySharedIds = new Set(credential.sharedWithUserIds);
        credential.sharedWithUserIds = (strArray(body.sharedWithUserIds) ?? []).filter(
          (id) => !!findUser(id),
        );
        const newlySharedIds = credential.sharedWithUserIds.filter((id) => !previouslySharedIds.has(id));
        notifyEmployees(
          newlySharedIds,
          NotificationType.TEAM_ANNOUNCEMENT,
          `You were given access to “${credential.label}”`,
          `${requester.fullName} shared a credential with you.`,
          "/credentials",
        );
      }
      credential.updatedAt = nowIso();
      return credentialDto(credential);
    },
  },
  {
    method: "DELETE",
    regex: new RegExp(`^/credentials/${SEG}$`),
    handler: ({ params }) => {
      const index = credentials.findIndex((item) => item.id === params[0]);
      if (index === -1) throw new ApiError(404, "Credential not found.");
      const credential = credentials[index]!;
      const requester = currentUser();
      if (!canManageAnyCredential(requester.role) && credential.createdById !== requester.id) {
        throw new ApiError(403, "You don't have permission to delete this credential.");
      }
      credentials.splice(index, 1);
      return undefined;
    },
  },

  // ── Folders (project-scoped file browser) ────────────────────────────────────
  {
    method: "GET",
    regex: /^\/folders$/,
    handler: ({ query }) => {
      const projectId = query.get("projectId");
      if (!projectId) throw new ApiError(400, "projectId is required.");
      if (!findProject(projectId)) throw new ApiError(404, "Project not found.");
      const parentFolderId = query.get("parentFolderId") || null;
      return folders
        .filter((folder) => folder.projectId === projectId && folder.parentFolderId === parentFolderId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(folderDto);
    },
  },
  {
    method: "POST",
    regex: /^\/folders$/,
    handler: ({ body }) => {
      const projectId = str(body.projectId);
      const name = str(body.name)?.trim();
      const parentFolderId = str(body.parentFolderId) || null;
      if (!projectId) throw new ApiError(400, "projectId is required.");
      if (!name) throw new ApiError(400, "Folder name is required.");
      if (!findProject(projectId)) throw new ApiError(404, "Project not found.");
      if (parentFolderId && !folders.some((folder) => folder.id === parentFolderId)) {
        throw new ApiError(404, "Parent folder not found.");
      }
      if (
        folders.some(
          (folder) =>
            folder.projectId === projectId &&
            folder.parentFolderId === parentFolderId &&
            folder.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new ApiError(409, `A folder named "${name}" already exists here.`);
      }
      const created: MockFolder = {
        id: newMockId(MOCK_ID_KIND.FOLDER),
        projectId,
        parentFolderId,
        name,
        createdById: currentUser().id,
        createdAt: nowIso(),
      };
      folders.push(created);
      return folderDto(created);
    },
  },
  {
    method: "DELETE",
    regex: new RegExp(`^/folders/${SEG}$`),
    handler: ({ params }) => {
      const index = folders.findIndex((folder) => folder.id === params[0]);
      if (index === -1) throw new ApiError(404, "Folder not found.");
      const folder = folders[index]!;
      const hasSubfolders = folders.some((f) => f.parentFolderId === folder.id);
      const hasFiles = latestVersionsForScope(folder.projectId, null, folder.id).length > 0;
      if (hasSubfolders || hasFiles) {
        throw new ApiError(400, "Empty this folder before deleting it.");
      }
      folders.splice(index, 1);
      return undefined;
    },
  },

  // ── Files ─────────────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/files$/,
    handler: ({ query }) => {
      const projectId = query.get("projectId");
      const taskId = query.get("taskId");
      if (!projectId && !taskId) {
        throw new ApiError(400, "Provide either a projectId or a taskId.");
      }
      if (projectId && !findProject(projectId)) throw new ApiError(404, "Project not found.");
      if (!projectId && taskId && !findTask(taskId)) throw new ApiError(404, "Task not found.");

      // Task scope has no folders — `undefined` means "don't filter by folder".
      const folderId = projectId ? query.get("folderId") || null : undefined;
      return latestVersionsForScope(projectId ?? null, taskId ?? null, folderId).map(attachmentDto);
    },
  },
  {
    method: "POST",
    regex: /^\/files\/upload-url$/,
    handler: ({ body }) => {
      const fileName = str(body.fileName)?.trim();
      const mimeType = str(body.mimeType)?.trim() || "application/octet-stream";
      const sizeBytes = num(body.sizeBytes) ?? 0;
      const projectId = str(body.projectId) ?? null;
      const taskId = str(body.taskId) ?? null;
      const folderId = projectId ? str(body.folderId) || null : null;

      if (!fileName) throw new ApiError(400, "fileName is required.");
      if (!projectId && !taskId) throw new ApiError(400, "Provide either a projectId or a taskId.");
      if (projectId && !findProject(projectId)) throw new ApiError(404, "Project not found.");
      if (!projectId && taskId && !findTask(taskId)) throw new ApiError(404, "Task not found.");
      if (folderId && !folders.some((folder) => folder.id === folderId)) {
        throw new ApiError(404, "Folder not found.");
      }

      const sameScope = attachments.filter((file) =>
        projectId ? file.projectId === projectId && file.folderId === folderId : file.taskId === taskId,
      );
      const existing = sameScope.filter((file) => file.fileName === fileName);
      const fileGroupId = existing[0]?.fileGroupId ?? `grp-${fileName}-${projectId ?? taskId}-${folderId ?? "root"}`;
      const version = existing.reduce((max, file) => Math.max(max, file.version), 0) + 1;
      const scope = projectId ? `projects/${projectId}` : `tasks/${taskId}`;
      const blobPath = `${scope}/v${version}/${fileName}`;

      const created: MockAttachment = {
        id: newMockId(MOCK_ID_KIND.ATTACHMENT),
        fileGroupId,
        fileName,
        mimeType,
        sizeBytes,
        blobPath,
        version,
        uploadedById: currentUser().id,
        projectId,
        taskId: projectId ? null : taskId,
        folderId,
        createdAt: nowIso(),
      };
      attachments.push(created);
      notifyConnectedToFile(created);

      return {
        attachmentId: created.id,
        // There is no blob storage in mock mode, so the page's follow-up PUT to
        // this URL will fail — exactly as it does in a local environment without
        // Azure Blob Storage. The attachment record above is already persisted,
        // so the file still appears in the list after the query is invalidated.
        uploadUrl: `https://mockstorage.local/gs-workhub/${blobPath}?mock-sas=1`,
        blobPath,
      };
    },
  },
  {
    // Creates a text file directly, with real content — no blob-storage round
    // trip needed since the content is small enough to just store inline.
    method: "POST",
    regex: /^\/files\/text$/,
    handler: ({ body }) => {
      const fileName = str(body.fileName)?.trim();
      const projectId = str(body.projectId);
      const folderId = str(body.folderId) || null;
      const content = str(body.content) ?? "";

      if (!fileName) throw new ApiError(400, "fileName is required.");
      if (!projectId) throw new ApiError(400, "projectId is required.");
      if (!findProject(projectId)) throw new ApiError(404, "Project not found.");
      if (folderId && !folders.some((folder) => folder.id === folderId)) {
        throw new ApiError(404, "Folder not found.");
      }

      const sameScope = attachments.filter(
        (file) => file.projectId === projectId && file.folderId === folderId,
      );
      const existing = sameScope.filter((file) => file.fileName === fileName);
      const fileGroupId = existing[0]?.fileGroupId ?? `grp-${fileName}-${projectId}-${folderId ?? "root"}`;
      const version = existing.reduce((max, file) => Math.max(max, file.version), 0) + 1;
      const blobPath = `projects/${projectId}/v${version}/${fileName}`;

      const created: MockAttachment = {
        id: newMockId(MOCK_ID_KIND.ATTACHMENT),
        fileGroupId,
        fileName,
        mimeType: "text/plain",
        sizeBytes: new TextEncoder().encode(content).length,
        blobPath,
        version,
        uploadedById: currentUser().id,
        projectId,
        taskId: null,
        folderId,
        textContent: content,
        createdAt: nowIso(),
      };
      attachments.push(created);
      notifyConnectedToFile(created);
      return attachmentDto(created);
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/files/${SEG}/download-url$`),
    handler: ({ params }) => {
      const file = attachments.find((item) => item.id === params[0]);
      if (!file) throw new ApiError(404, "File not found.");

      const content =
        file.textContent ??
        [
          "GS WorkHub — mock file placeholder",
          "",
          `File name : ${file.fileName}`,
          `Version   : v${file.version}`,
          `Mime type : ${file.mimeType}`,
          `Size      : ${file.sizeBytes} bytes`,
          `Blob path : ${file.blobPath}`,
          "",
          "Mock mode stores no bytes — this placeholder stands in for the real download.",
        ].join("\n");

      return {
        downloadUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
        fileName: file.fileName,
        mimeType: file.mimeType,
      };
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/files/${SEG}/versions$`),
    handler: ({ params }) => {
      const file = attachments.find((item) => item.id === params[0]);
      if (!file) throw new ApiError(404, "File not found.");
      return attachments
        .filter((item) => item.fileGroupId === file.fileGroupId)
        .sort((a, b) => b.version - a.version)
        .map(attachmentDto);
    },
  },
  {
    method: "DELETE",
    regex: new RegExp(`^/files/${SEG}$`),
    handler: ({ params }) => {
      const index = attachments.findIndex((item) => item.id === params[0]);
      if (index === -1) throw new ApiError(404, "File not found.");
      attachments.splice(index, 1);
      return undefined;
    },
  },

  // ── Reports ───────────────────────────────────────────────────────────────
  {
    method: "GET",
    regex: /^\/reports\/company$/,
    handler: () => {
      const resourced = users.filter(
        (user) => user.isActive && RESOURCED_ROLES.includes(user.role),
      );
      const totalCapacity = resourced.reduce((sum, user) => sum + user.capacityHoursPerWeek, 0);
      const totalAllocated = resourced.reduce((sum, user) => sum + allocatedHoursFor(user.id), 0);

      const departmentPerformance = departments
        .filter((department) => !department.isArchived)
        .map((department) => {
          const projectIds = new Set(
            projects.filter((project) => project.departmentId === department.id).map((p) => p.id),
          );
          const departmentTasks = tasks.filter((task) => projectIds.has(task.projectId));
          const completed = departmentTasks.filter((task) => task.status === TaskStatus.COMPLETED).length;
          const departmentUsers = users.filter(
            (u) => u.isActive && u.departmentId === department.id && RESOURCED_ROLES.includes(u.role),
          );
          const deptCapacity = departmentUsers.reduce((sum, u) => sum + u.capacityHoursPerWeek, 0);
          const deptAllocated = departmentUsers.reduce((sum, u) => sum + allocatedHoursFor(u.id), 0);
          return {
            departmentId: department.id,
            name: department.name,
            completionRate:
              departmentTasks.length > 0
                ? Math.round((completed / departmentTasks.length) * 1000) / 10
                : 0,
            employeeCount: users.filter((u) => u.isActive && u.departmentId === department.id).length,
            activeProjectCount: projects.filter(
              (project) => project.departmentId === department.id && isActiveProject(project),
            ).length,
            utilizationPct:
              deptCapacity > 0 ? Math.round((deptAllocated / deptCapacity) * 1000) / 10 : 0,
          };
        });

      const projectsByStatus: Record<ProjectStatus, number> = {
        [ProjectStatus.PLANNING]: 0,
        [ProjectStatus.IN_PROGRESS]: 0,
        [ProjectStatus.ON_HOLD]: 0,
        [ProjectStatus.REVIEW]: 0,
        [ProjectStatus.COMPLETED]: 0,
        [ProjectStatus.CANCELLED]: 0,
      };
      for (const project of projects) projectsByStatus[project.status] += 1;

      const now = Date.now();
      const overdueTasksCount = tasks.filter(
        (task) =>
          task.dueDate && task.status !== TaskStatus.COMPLETED && new Date(task.dueDate).getTime() < now,
      ).length;

      const upcomingDeadlines = projects
        .filter(
          (project) =>
            !!project.dueDate &&
            project.status !== ProjectStatus.COMPLETED &&
            project.status !== ProjectStatus.CANCELLED,
        )
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
        .slice(0, 5)
        .map((project) => ({
          id: project.id,
          name: project.name,
          dueDate: project.dueDate,
          status: project.status,
          healthScore: project.healthScore,
        }));

      const topWorkload = resourced
        .map(workloadSummary)
        .sort((a, b) => b.utilizationPct - a.utilizationPct)
        .slice(0, 5);

      return {
        totalProjects: projects.length,
        activeProjects: projects.filter(isActiveProject).length,
        completedProjects: projects.filter((project) => project.status === ProjectStatus.COMPLETED)
          .length,
        totalEmployees: users.filter((user) => user.isActive && user.role !== SystemRole.CLIENT).length,
        totalDepartments: departments.filter((department) => !department.isArchived).length,
        totalTeams: teams.filter((team) => !team.isArchived).length,
        overdueTasksCount,
        departmentPerformance,
        projectsByStatus,
        upcomingDeadlines,
        topWorkload,
        resourceUtilizationPct:
          totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 1000) / 10 : 0,
      };
    },
  },
  {
    method: "GET",
    regex: new RegExp(`^/reports/departments/${SEG}$`),
    handler: ({ params }) => {
      const department = findDepartment(params[0]);
      if (!department) throw new ApiError(404, "Department not found.");

      const departmentProjects = projects.filter(
        (project) => project.departmentId === department.id,
      );
      const projectIds = new Set(departmentProjects.map((project) => project.id));
      const departmentTasks = tasks.filter((task) => projectIds.has(task.projectId));
      const completedTasks = departmentTasks.filter((task) => task.status === TaskStatus.COMPLETED);
      const nowTime = Date.now();

      const scoped = users.filter(
        (user) =>
          user.isActive && RESOURCED_ROLES.includes(user.role) && user.departmentId === department.id,
      );
      const totalCapacity = scoped.reduce((sum, user) => sum + user.capacityHoursPerWeek, 0);
      const totalAllocated = scoped.reduce((sum, user) => sum + allocatedHoursFor(user.id), 0);

      return {
        activeProjects: departmentProjects.filter(isActiveProject).length,
        activeTasks: departmentTasks.filter((task) => task.status !== TaskStatus.COMPLETED).length,
        overdueTasks: departmentTasks.filter(
          (task) =>
            task.status !== TaskStatus.COMPLETED &&
            !!task.dueDate &&
            new Date(task.dueDate).getTime() < nowTime,
        ).length,
        teamProductivity:
          departmentTasks.length > 0
            ? Math.round((completedTasks.length / departmentTasks.length) * 1000) / 10
            : 0,
        utilizationPct:
          totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 1000) / 10 : 0,
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a mock response for `method` + `path` (query string included),
 * mutating the fixture arrays for write requests.
 *
 * @throws {ApiError} on validation failures and on a routing miss (404).
 */
export async function handleMockRequest(
  method: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  await latency();

  const upperMethod = method.toUpperCase();
  const [rawPathname = "", queryString = ""] = path.split("?");
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, "") : rawPathname;
  const query = new URLSearchParams(queryString);
  const parsedBody = asRecord(body);

  for (const route of routes) {
    if (route.method !== upperMethod) continue;
    const match = route.regex.exec(pathname);
    if (!match) continue;

    return route.handler({
      params: match.slice(1).map((segment) => (segment ? decodeURIComponent(segment) : "")),
      query,
      body: parsedBody,
      rawBody: body,
      method: upperMethod,
      path,
    });
  }

  throw new ApiError(404, `Not found: ${upperMethod} ${path}`);
}
