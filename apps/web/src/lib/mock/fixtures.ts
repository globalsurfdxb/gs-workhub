/**
 * In-memory fixture dataset for GS WorkHub "mock mode".
 *
 * Enabled by NEXT_PUBLIC_USE_MOCK_DATA=true. `src/lib/mock/router.ts` reads and
 * mutates these arrays so the whole frontend can be exercised without the
 * NestJS API or Postgres running.
 *
 * ── ID scheme ────────────────────────────────────────────────────────────────
 * Every id is a *stable, deterministic* value — never random — so fixtures are
 * easy to cross-reference while debugging. They are shaped as UUIDs because
 * several page-level forms validate ids with zod's `.uuid()` (see
 * `packages/shared/src/schemas.ts`: createProjectSchema.departmentId/ownerId,
 * createTaskSchema.projectId, createTeamSchema.departmentId/teamLeadId, and the
 * `z.string().uuid()` fields in projects/page.tsx + projects/[id]/page.tsx).
 * Plain slugs like "dept-digital" would fail that client-side validation before
 * any request was made, so each id encodes an entity kind in its first group
 * plus a zero-padded sequence number in its last group:
 *
 *   d0000000-…  department        a0000000-…  project      2b000000-…  approval
 *   c0000000-…  team              b0000000-…  milestone    3c000000-…  notification
 *   cb000000-…  team membership   f0000000-…  task         4d000000-…  attachment
 *   e0000000-…  user/employee     fa000000-…  task assignee row
 *   1a000000-…  timesheet entry   fb000000-…  task watcher row
 *   5e000000-…  KPI snapshot      fc000000-…  task comment
 *   0000000f-…  organization      fd000000-…  task activity entry
 *   6f000000-…  sprint            7a000000-…  bug
 *
 * Named constants (DEPT_DIGITAL, USER_VIKRAM_DESAI, PROJECT_WEBSITE_RELAUNCH, …)
 * are exported and used throughout, so the fixtures still read like slugs.
 */

import {
  ApprovalStatus,
  ApprovalType,
  CredentialCategory,
  EmployeeAvailability,
  NotificationType,
  Priority,
  ProjectMethodology,
  ProjectStatus,
  SystemRole,
  TaskStatus,
  TimesheetStatus,
} from "@/lib/shared";

// ─────────────────────────────────────────────────────────────────────────────
// ID + date helpers
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_ID_KIND = {
  ORGANIZATION: "0000000f",
  DEPARTMENT: "d0000000",
  TEAM: "c0000000",
  TEAM_MEMBER: "cb000000",
  USER: "e0000000",
  PROJECT: "a0000000",
  MILESTONE: "b0000000",
  TASK: "f0000000",
  TASK_ASSIGNEE: "fa000000",
  TASK_WATCHER: "fb000000",
  COMMENT: "fc000000",
  ACTIVITY: "fd000000",
  TIMESHEET: "1a000000",
  APPROVAL: "2b000000",
  NOTIFICATION: "3c000000",
  ATTACHMENT: "4d000000",
  KPI: "5e000000",
  SPRINT: "6f000000",
  BUG: "7a000000",
  FOLDER: "8b000000",
  CREDENTIAL: "9c000000",
  CUSTOM_ROLE: "ad000000",
} as const;

export type MockIdKind = (typeof MOCK_ID_KIND)[keyof typeof MOCK_ID_KIND];

/** Shorthand used throughout this module. */
const KIND = MOCK_ID_KIND;

/** Builds a deterministic UUID-shaped id, e.g. mockId(MOCK_ID_KIND.USER, 12). */
export function mockId(kind: MockIdKind, index: number): string {
  return `${kind}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

/** Monotonic counters so newly created records never collide with fixtures. */
const nextIndex: Record<string, number> = {};

/** Allocates the next unused id for `kind`, well clear of the seeded range. */
export function newMockId(kind: MockIdKind, startAfter = 900): string {
  nextIndex[kind] = (nextIndex[kind] ?? startAfter) + 1;
  return mockId(kind, nextIndex[kind]);
}

/** Module-load "now" — every relative fixture date is anchored to this. */
const NOW = new Date();

/** Full ISO datetime `dayOffset` days from module load. */
function iso(dayOffset: number, hour = 9, minute = 0): string {
  const d = new Date(NOW.getTime());
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Calendar-date-only string ("YYYY-MM-DD") `dayOffset` days from module load. */
export function dateOnly(dayOffset: number): string {
  const d = new Date(NOW.getTime());
  d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" for today — used when creating records at runtime. */
export function todayDateOnly(): string {
  return dateOnly(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface MockOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface MockDepartment {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description: string | null;
  managerId: string | null;
  /** Department-scoped leadership role — see `SystemRole.DEPARTMENT_HEAD`. */
  headId: string | null;
  isArchived: boolean;
  createdAt: string;
}

export interface MockTeam {
  id: string;
  departmentId: string;
  name: string;
  code: string;
  teamLeadId: string | null;
  capacityHoursPerWeek: number;
  methodology: ProjectMethodology;
  isArchived: boolean;
  createdAt: string;
}

export interface MockTeamMember {
  id: string;
  teamId: string;
  userId: string;
  joinedAt: string;
}

export interface MockUser {
  id: string;
  fullName: string;
  email: string;
  role: SystemRole;
  designation: string | null;
  skills: string[];
  availability: EmployeeAvailability;
  capacityHoursPerWeek: number;
  avatarUrl: string | null;
  departmentId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface MockProject {
  id: string;
  departmentId: string;
  teamId: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  startDate: string | null;
  dueDate: string | null;
  healthScore: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockMilestone {
  id: string;
  projectId: string;
  name: string;
  dueDate: string | null;
  isCompleted: boolean;
  createdAt: string;
}

export interface MockTask {
  id: string;
  projectId: string;
  milestoneId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeIds: string[];
  watcherIds: string[];
  dependencyIds: string[];
  dueDate: string | null;
  estimatedHours: number | null;
  isRecurring: boolean;
  /** Agile sprint the task is committed to. `null` for non-sprint / non-Agile work. */
  sprintId: string | null;
  /** Agile estimate in story points. `null` when the task is not point-estimated. */
  storyPoints: number | null;
  /**
   * ISO timestamp the work timer was last started, or `null` when no timer is
   * running. Only meaningful while `status` is `IN_PROGRESS` — changing status
   * away from In Progress auto-stops and banks it. Optional so existing seed
   * tasks don't each need one.
   */
  activeTimerStartedAt?: string | null;
  /** Minutes banked by the timer across every start/stop session so far. */
  loggedMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Agile sprint — currently only seeded for the Development team, which powers the
 * Development Dashboard (`GET /teams/:id/dev-dashboard`). Mock-only: sprints are a
 * Phase 3 "Development Team workspace" concept and do not exist in the API yet.
 */
export interface MockSprint {
  id: string;
  teamId: string;
  /** The project this sprint's work is committed against. */
  projectId: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
  createdAt: string;
}

/** Bug workflow states — mirrors the QA module workflow in the product spec. */
export type MockBugStatus =
  | "NEW"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "FIXED"
  | "QA_REVIEW"
  | "CLOSED";

/**
 * Defect raised against a project (optionally traced to the task that introduced
 * or fixes it). `priority` doubles as severity, reusing the shared Priority enum.
 * Mock-only, same Phase 3 caveat as `MockSprint`.
 */
export interface MockBug {
  id: string;
  projectId: string;
  taskId: string | null;
  title: string;
  /** Free-text reproduction notes captured by the "Report Bug" form. */
  description: string | null;
  priority: Priority;
  status: MockBugStatus;
  reportedById: string;
  assigneeId: string | null;
  /**
   * Data-URL screenshot captured at report time. Optional so the ~30 seeded
   * bugs don't all need one; stored inline (no Azure Blob Storage — bugs are
   * mock-only) rather than through the real Files/Attachments flow.
   */
  screenshotUrl?: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /**
   * Every status transition, oldest first — who changed it and when. Optional
   * so the ~30 seeded bugs don't each need a fabricated backlog; a single
   * synthetic entry (current status, reporter, createdAt) is derived for
   * those in `bugRow()` when this is absent. New writes always append here.
   */
  statusHistory?: MockBugStatusHistoryEntry[];
}

export interface MockBugStatusHistoryEntry {
  id: string;
  status: MockBugStatus;
  changedById: string;
  changedAt: string;
}

export interface MockComment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface MockActivityEntry {
  id: string;
  taskId: string;
  actorId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface MockTimesheetEntry {
  id: string;
  employeeId: string;
  taskId: string | null;
  projectId: string | null;
  /** "YYYY-MM-DD" */
  date: string;
  hours: number;
  notes: string | null;
  status: TimesheetStatus;
  createdAt: string;
}

export interface MockApprovalRequest {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  requesterId: string;
  approverId: string | null;
  entityId: string;
  entityLabel: string;
  projectId: string | null;
  comment: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface MockNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface MockAttachment {
  id: string;
  /** Groups every version of the same logical file together. */
  fileGroupId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blobPath: string;
  version: number;
  uploadedById: string;
  projectId: string | null;
  taskId: string | null;
  /** Folder this file lives in — `null` is the project's root. Project-scoped only. */
  folderId: string | null;
  /**
   * Actual text for files created directly in-app (see `POST /files/text`) —
   * there's no real blob storage in mock mode, so this is what its "download"
   * returns instead of the generic placeholder used for uploaded files.
   */
  textContent?: string;
  createdAt: string;
}

/** A folder inside a project's file space. Project-scoped only (no task folders). */
export interface MockFolder {
  id: string;
  projectId: string;
  parentFolderId: string | null;
  name: string;
  createdById: string;
  createdAt: string;
}

export let folders: MockFolder[] = [];

/**
 * A stored login (cPanel, domain registrar, CMS, database, FTP, etc.) for a
 * project. Visible to its creator, anyone in `sharedWithUserIds`, and
 * department-or-above roles — see `isCredentialVisibleTo` in `router.ts`.
 * There is no real encryption here (mock mode only) — the UI masks the
 * password by default and requires an explicit reveal.
 */
export interface MockProjectCredential {
  id: string;
  /** Optional — a credential can be general-purpose, not tied to any single project. */
  projectId: string | null;
  label: string;
  category: CredentialCategory;
  username: string | null;
  password: string;
  url: string | null;
  notes: string | null;
  sharedWithUserIds: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export let credentials: MockProjectCredential[] = [];

/**
 * A named permission template Super Admin defines from the Roles &
 * Permissions page — its own module-access list, independent of the fixed
 * `SystemRole` enum. Not yet assignable to an employee record (see the
 * scope note in `router.ts`'s custom-roles routes) — it exists so a new
 * role's intended access can be defined and reviewed ahead of that.
 */
export interface MockCustomRole {
  id: string;
  name: string;
  description: string | null;
  /** `NavItem.key` values from `PERMISSION_MODULES` this role can access. */
  moduleAccess: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export let customRoles: MockCustomRole[] = [];

export interface MockKpiSnapshot {
  id: string;
  departmentId: string;
  capturedAt: string;
  projectsCompleted: number;
  tasksCompleted: number;
  utilizationPct: number;
  onTimeDeliveryPct: number;
}

export interface MockCredential {
  email: string;
  password: string;
  userId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stable id constants
// ─────────────────────────────────────────────────────────────────────────────

export const ORG_GLOBALSURF = mockId(KIND.ORGANIZATION, 1);

export const DEPT_DIGITAL = mockId(KIND.DEPARTMENT, 1);
export const DEPT_IT = mockId(KIND.DEPARTMENT, 2);

export const TEAM_DIGITAL_DEV = mockId(KIND.TEAM, 1);
export const TEAM_DIGITAL_QA = mockId(KIND.TEAM, 2);
export const TEAM_DIGITAL_SEO = mockId(KIND.TEAM, 3);
export const TEAM_DIGITAL_CONTENT = mockId(KIND.TEAM, 4);
export const TEAM_DIGITAL_DESIGN = mockId(KIND.TEAM, 5);
export const TEAM_DIGITAL_MKT = mockId(KIND.TEAM, 6);
export const TEAM_DIGITAL_INHOUSE_MKT = mockId(KIND.TEAM, 7);
export const TEAM_IT_PROJECTS = mockId(KIND.TEAM, 8);
export const TEAM_IT_SOLUTIONS = mockId(KIND.TEAM, 9);

export const USER_YUSUF_RAHMAN = mockId(KIND.USER, 1);
export const USER_LAYLA_AL_MANSOORI = mockId(KIND.USER, 2);
export const USER_OMAR_FARIS = mockId(KIND.USER, 3);
export const USER_RASHID_BIN_SALEM = mockId(KIND.USER, 4);
export const USER_PRIYA_NAIR = mockId(KIND.USER, 5);
export const USER_HASSAN_IQBAL = mockId(KIND.USER, 6);
export const USER_FATIMA_AL_ZAABI = mockId(KIND.USER, 7);
export const USER_DANIEL_OKAFOR = mockId(KIND.USER, 8);
export const USER_AISHA_KAREEM = mockId(KIND.USER, 9);
export const USER_MARCUS_SILVA = mockId(KIND.USER, 10);
export const USER_NOOR_HADDAD = mockId(KIND.USER, 11);
export const USER_VIKRAM_DESAI = mockId(KIND.USER, 12);
export const USER_SARA_MUBARAK = mockId(KIND.USER, 13);
export const USER_KHALID_NASSER = mockId(KIND.USER, 14);

export const PROJECT_WEBSITE_RELAUNCH = mockId(KIND.PROJECT, 1);
export const PROJECT_SEO_GROWTH = mockId(KIND.PROJECT, 2);
export const PROJECT_BRAND_REFRESH = mockId(KIND.PROJECT, 3);
export const PROJECT_CONTENT_HUB = mockId(KIND.PROJECT, 4);
export const PROJECT_ERP_INTEGRATION = mockId(KIND.PROJECT, 5);
export const PROJECT_ENDPOINT_SECURITY = mockId(KIND.PROJECT, 6);
export const PROJECT_PAID_SOCIAL = mockId(KIND.PROJECT, 7);
export const PROJECT_INTRANET_DECOMMISSION = mockId(KIND.PROJECT, 8);
// Development-team projects — added alongside the sprint/bug fixtures so the
// Development Dashboard's "Projects by Status" donut has a real spread.
export const PROJECT_API_PLATFORM = mockId(KIND.PROJECT, 9);
export const PROJECT_BOOKING_ENGINE = mockId(KIND.PROJECT, 10);
export const PROJECT_MOBILE_APP = mockId(KIND.PROJECT, 11);
export const PROJECT_CLIENT_PORTAL = mockId(KIND.PROJECT, 12);
export const PROJECT_LEGACY_PLUGIN = mockId(KIND.PROJECT, 13);

export const SPRINT_17 = mockId(KIND.SPRINT, 17);
export const SPRINT_18 = mockId(KIND.SPRINT, 18);
export const SPRINT_19 = mockId(KIND.SPRINT, 19);
export const SPRINT_20 = mockId(KIND.SPRINT, 20);
export const SPRINT_21 = mockId(KIND.SPRINT, 21);
export const SPRINT_22 = mockId(KIND.SPRINT, 22);

const task = (n: number) => mockId(KIND.TASK, n);
const milestone = (n: number) => mockId(KIND.MILESTONE, n);

// ─────────────────────────────────────────────────────────────────────────────
// Organization
// ─────────────────────────────────────────────────────────────────────────────

export let organizations: MockOrganization[] = [
  {
    id: ORG_GLOBALSURF,
    name: "GlobalSurf",
    slug: "globalsurf",
    createdAt: iso(-720),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Role-based access control — Super Admin's editable nav-module permission
// matrix (see `/admin/roles` and `PERMISSION_MODULES` in
// `@/components/layout/nav-items`). Keys match each `NavItem.key`. This is
// the seed/default state; Super Admin edits it at runtime via
// `PATCH /role-permissions/:key`. Super Admin itself is always force-included
// server-side regardless of what's stored here — see `router.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_ROLES: SystemRole[] = [
  SystemRole.SUPER_ADMIN,
  SystemRole.MANAGER,
  SystemRole.GENERAL_MANAGER,
  SystemRole.DEPARTMENT_MANAGER,
  SystemRole.DEPARTMENT_HEAD,
  SystemRole.TEAM_LEAD,
  SystemRole.EMPLOYEE,
  SystemRole.CLIENT,
];

const SUPER_ADMIN_TIER: SystemRole[] = [
  SystemRole.SUPER_ADMIN,
  SystemRole.MANAGER,
  SystemRole.GENERAL_MANAGER,
];

export let rolePermissions: Record<string, SystemRole[]> = {
  dashboard: [...ALL_ROLES],
  projects: [...ALL_ROLES],
  tasks: [...ALL_ROLES],
  sprints: [...SUPER_ADMIN_TIER, SystemRole.DEPARTMENT_MANAGER, SystemRole.TEAM_LEAD],
  bugs: [...SUPER_ADMIN_TIER, SystemRole.DEPARTMENT_MANAGER, SystemRole.TEAM_LEAD],
  workload: [...ALL_ROLES],
  timesheets: [...ALL_ROLES],
  approvals: [...ALL_ROLES],
  notifications: [...ALL_ROLES],
  files: [...ALL_ROLES],
  credentials: [...ALL_ROLES],
  departments: [...SUPER_ADMIN_TIER, SystemRole.DEPARTMENT_MANAGER],
  employees: [...SUPER_ADMIN_TIER, SystemRole.DEPARTMENT_MANAGER, SystemRole.DEPARTMENT_HEAD],
  settings: [...SUPER_ADMIN_TIER],
  teams: [...SUPER_ADMIN_TIER, SystemRole.DEPARTMENT_MANAGER, SystemRole.DEPARTMENT_HEAD],
};

// ─────────────────────────────────────────────────────────────────────────────
// Departments
// ─────────────────────────────────────────────────────────────────────────────

export let departments: MockDepartment[] = [
  {
    id: DEPT_DIGITAL,
    organizationId: ORG_GLOBALSURF,
    name: "Digital Department",
    code: "DIGITAL",
    description:
      "Owns GlobalSurf's digital delivery — web engineering, QA, SEO, content, design, and marketing execution for clients and the GlobalSurf brand.",
    managerId: USER_LAYLA_AL_MANSOORI,
    headId: null,
    isArchived: false,
    createdAt: iso(-700),
  },
  {
    id: DEPT_IT,
    organizationId: ORG_GLOBALSURF,
    name: "IT Department",
    code: "IT",
    description:
      "Runs internal IT projects, business systems integration, infrastructure, and endpoint security across all GlobalSurf offices.",
    managerId: USER_OMAR_FARIS,
    headId: null,
    isArchived: false,
    createdAt: iso(-698),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────────────────────────────────────

export let teams: MockTeam[] = [
  {
    id: TEAM_DIGITAL_DEV,
    departmentId: DEPT_DIGITAL,
    name: "Development",
    code: "DIGITAL-DEV",
    teamLeadId: USER_RASHID_BIN_SALEM,
    capacityHoursPerWeek: 85,
    methodology: ProjectMethodology.AGILE,
    isArchived: false,
    createdAt: iso(-690),
  },
  {
    id: TEAM_DIGITAL_QA,
    departmentId: DEPT_DIGITAL,
    name: "QA",
    code: "DIGITAL-QA",
    teamLeadId: USER_PRIYA_NAIR,
    capacityHoursPerWeek: 38,
    methodology: ProjectMethodology.AGILE,
    isArchived: false,
    createdAt: iso(-688),
  },
  {
    id: TEAM_DIGITAL_SEO,
    departmentId: DEPT_DIGITAL,
    name: "SEO",
    code: "DIGITAL-SEO",
    teamLeadId: null,
    capacityHoursPerWeek: 40,
    methodology: ProjectMethodology.KANBAN,
    isArchived: false,
    createdAt: iso(-686),
  },
  {
    id: TEAM_DIGITAL_CONTENT,
    departmentId: DEPT_DIGITAL,
    name: "Content",
    code: "DIGITAL-CONTENT",
    teamLeadId: null,
    capacityHoursPerWeek: 71,
    methodology: ProjectMethodology.KANBAN,
    isArchived: false,
    createdAt: iso(-684),
  },
  {
    id: TEAM_DIGITAL_DESIGN,
    departmentId: DEPT_DIGITAL,
    name: "Design",
    code: "DIGITAL-DESIGN",
    teamLeadId: USER_AISHA_KAREEM,
    capacityHoursPerWeek: 36,
    methodology: ProjectMethodology.KANBAN,
    isArchived: false,
    createdAt: iso(-682),
  },
  {
    id: TEAM_DIGITAL_MKT,
    departmentId: DEPT_DIGITAL,
    name: "Marketing",
    code: "DIGITAL-MKT",
    teamLeadId: null,
    capacityHoursPerWeek: 40,
    methodology: ProjectMethodology.KANBAN,
    isArchived: false,
    createdAt: iso(-680),
  },
  {
    id: TEAM_DIGITAL_INHOUSE_MKT,
    departmentId: DEPT_DIGITAL,
    name: "In-House Marketing",
    code: "DIGITAL-INHOUSE-MKT",
    teamLeadId: null,
    capacityHoursPerWeek: 70,
    methodology: ProjectMethodology.KANBAN,
    isArchived: false,
    createdAt: iso(-678),
  },
  {
    id: TEAM_IT_PROJECTS,
    departmentId: DEPT_IT,
    name: "IT Projects",
    code: "IT-PROJECTS",
    teamLeadId: USER_HASSAN_IQBAL,
    capacityHoursPerWeek: 42,
    methodology: ProjectMethodology.WATERFALL,
    isArchived: false,
    createdAt: iso(-676),
  },
  {
    id: TEAM_IT_SOLUTIONS,
    departmentId: DEPT_IT,
    name: "IT Solutions",
    code: "IT-SOLUTIONS",
    teamLeadId: USER_SARA_MUBARAK,
    capacityHoursPerWeek: 40,
    methodology: ProjectMethodology.KANBAN,
    isArchived: false,
    createdAt: iso(-674),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Users / employees
// ─────────────────────────────────────────────────────────────────────────────

export let users: MockUser[] = [
  {
    id: USER_YUSUF_RAHMAN,
    fullName: "Yusuf Rahman",
    email: "super-admin@globalsurf.ae",
    role: SystemRole.SUPER_ADMIN,
    designation: "Chief Operating Officer",
    skills: ["Operating Model", "Governance", "Portfolio Oversight"],
    availability: EmployeeAvailability.AVAILABLE,
    capacityHoursPerWeek: 40,
    avatarUrl: null,
    departmentId: null,
    isActive: true,
    createdAt: iso(-700),
  },
  {
    id: USER_LAYLA_AL_MANSOORI,
    fullName: "Layla Al Mansoori",
    email: "layla.almansoori@globalsurf.ae",
    role: SystemRole.DEPARTMENT_MANAGER,
    designation: "Head of Digital",
    skills: ["Digital Strategy", "Team Leadership", "Client Management", "Analytics"],
    availability: EmployeeAvailability.AVAILABLE,
    capacityHoursPerWeek: 40,
    avatarUrl: null,
    departmentId: DEPT_DIGITAL,
    isActive: true,
    createdAt: iso(-690),
  },
  {
    id: USER_OMAR_FARIS,
    fullName: "Omar Faris",
    email: "omar.faris@globalsurf.ae",
    role: SystemRole.DEPARTMENT_MANAGER,
    designation: "Head of IT",
    skills: ["Infrastructure", "Cloud Architecture", "Vendor Management"],
    availability: EmployeeAvailability.PARTIALLY_AVAILABLE,
    capacityHoursPerWeek: 40,
    avatarUrl: null,
    departmentId: DEPT_IT,
    isActive: true,
    createdAt: iso(-688),
  },
  {
    id: USER_RASHID_BIN_SALEM,
    fullName: "Rashid Bin Salem",
    email: "developer-lead@globalsurf.ae",
    role: SystemRole.TEAM_LEAD,
    designation: "Development Team Lead",
    skills: ["TypeScript", "Node.js", "System Design", "Code Review"],
    availability: EmployeeAvailability.AVAILABLE,
    capacityHoursPerWeek: 40,
    avatarUrl: null,
    departmentId: DEPT_DIGITAL,
    isActive: true,
    createdAt: iso(-660),
  },
  {
    id: USER_PRIYA_NAIR,
    fullName: "Priya Nair",
    email: "priya.nair@globalsurf.ae",
    role: SystemRole.TEAM_LEAD,
    designation: "QA Team Lead",
    skills: ["Test Automation", "Playwright", "Release QA", "Accessibility Testing"],
    availability: EmployeeAvailability.AVAILABLE,
    capacityHoursPerWeek: 38,
    avatarUrl: null,
    departmentId: DEPT_DIGITAL,
    isActive: true,
    createdAt: iso(-655),
  },
  {
    id: USER_HASSAN_IQBAL,
    fullName: "Hassan Iqbal",
    email: "it-lead@gs-it.ae",
    role: SystemRole.TEAM_LEAD,
    designation: "IT Projects Lead",
    skills: ["Project Delivery", "ERP", "Systems Integration"],
    availability: EmployeeAvailability.PARTIALLY_AVAILABLE,
    capacityHoursPerWeek: 42,
    avatarUrl: null,
    departmentId: DEPT_IT,
    isActive: true,
    createdAt: iso(-650),
  },
  {
    id: USER_FATIMA_AL_ZAABI,
    fullName: "Fatima Al Zaabi",
    email: "fatima.alzaabi@globalsurf.ae",
    role: SystemRole.EMPLOYEE,
    designation: "Senior SEO Specialist",
    skills: ["Technical SEO", "Keyword Research", "GA4", "Search Console"],
    availability: EmployeeAvailability.AVAILABLE,
    capacityHoursPerWeek: 40,
    avatarUrl: null,
    departmentId: DEPT_DIGITAL,
    isActive: true,
    createdAt: iso(-600),
  },
  {
    id: USER_DANIEL_OKAFOR,
    fullName: "Daniel Okafor",
    email: "daniel.okafor@globalsurf.ae",
    role: SystemRole.EMPLOYEE,
    designation: "Content Strategist",
    skills: ["Copywriting", "Content Operations", "Editorial Planning"],
    availability: EmployeeAvailability.AVAILABLE,
    capacityHoursPerWeek: 35,
    avatarUrl: null,
    departmentId: DEPT_DIGITAL,
    isActive: true,
    createdAt: iso(-580),
  },
  {
    id: USER_AISHA_KAREEM,
    fullName: "Aisha Kareem",
    email: "aisha.kareem@globalsurf.ae",
    role: SystemRole.EMPLOYEE,
    designation: "Senior Product Designer",
    skills: ["Figma", "Design Systems", "Prototyping", "Brand Identity"],
    availability: EmployeeAvailability.PARTIALLY_AVAILABLE,
    capacityHoursPerWeek: 36,
    avatarUrl: null,
    departmentId: DEPT_DIGITAL,
    isActive: true,
    createdAt: iso(-560),
  },
  {
    id: USER_MARCUS_SILVA,
    fullName: "Marcus Silva",
    email: "marcus.silva@globalsurf.ae",
    role: SystemRole.EMPLOYEE,
    designation: "Performance Marketing Executive",
    skills: ["Paid Social", "Google Ads", "Campaign Reporting"],
    availability: EmployeeAvailability.AVAILABLE,
    capacityHoursPerWeek: 40,
    avatarUrl: null,
    departmentId: DEPT_DIGITAL,
    isActive: true,
    createdAt: iso(-540),
  },
  {
    id: USER_NOOR_HADDAD,
    fullName: "Noor Haddad",
    email: "noor.haddad@globalsurf.ae",
    role: SystemRole.EMPLOYEE,
    designation: "In-House Marketing Coordinator",
    skills: ["Campaign Operations", "Email Marketing", "Event Support"],
    availability: EmployeeAvailability.ON_LEAVE,
    capacityHoursPerWeek: 30,
    avatarUrl: null,
    departmentId: DEPT_DIGITAL,
    isActive: true,
    createdAt: iso(-500),
  },
  {
    id: USER_VIKRAM_DESAI,
    fullName: "Vikram Desai",
    email: "vikram.desai@globalsurf.ae",
    role: SystemRole.EMPLOYEE,
    designation: "Frontend Engineer",
    skills: ["React", "Next.js", "Tailwind CSS", "Accessibility"],
    availability: EmployeeAvailability.AVAILABLE,
    capacityHoursPerWeek: 45,
    avatarUrl: null,
    departmentId: DEPT_DIGITAL,
    isActive: true,
    createdAt: iso(-480),
  },
  {
    id: USER_SARA_MUBARAK,
    fullName: "Sara Mubarak",
    email: "it-solutions-lead@gs-it.ae",
    role: SystemRole.TEAM_LEAD,
    designation: "IT Solutions Lead",
    skills: ["Windows Server", "Endpoint Security", "PowerShell", "Microsoft 365"],
    availability: EmployeeAvailability.AVAILABLE,
    capacityHoursPerWeek: 40,
    avatarUrl: null,
    departmentId: DEPT_IT,
    isActive: true,
    createdAt: iso(-460),
  },
  {
    id: USER_KHALID_NASSER,
    fullName: "Khalid Nasser",
    email: "khalid.nasser@globalsurf.ae",
    role: SystemRole.CLIENT,
    designation: "Client Stakeholder — Nova Retail Group",
    skills: ["Stakeholder Review"],
    availability: EmployeeAvailability.UNAVAILABLE,
    capacityHoursPerWeek: 30,
    avatarUrl: null,
    departmentId: null,
    isActive: true,
    createdAt: iso(-300),
  },
];

/**
 * Mock sign-in credentials. Every seeded user shares one password so any
 * persona can be tested. Mock-only and cosmetic — never sent to a real backend.
 */
export const MOCK_PASSWORD = "Password123!";

export let MOCK_CREDENTIALS: MockCredential[] = users.map((user) => ({
  email: user.email,
  password: MOCK_PASSWORD,
  userId: user.id,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Team memberships
// ─────────────────────────────────────────────────────────────────────────────

let teamMemberSeq = 0;
function member(teamId: string, userId: string, dayOffset: number): MockTeamMember {
  teamMemberSeq += 1;
  return {
    id: mockId(KIND.TEAM_MEMBER, teamMemberSeq),
    teamId,
    userId,
    joinedAt: iso(dayOffset),
  };
}

export let teamMembers: MockTeamMember[] = [
  member(TEAM_DIGITAL_DEV, USER_RASHID_BIN_SALEM, -660),
  member(TEAM_DIGITAL_DEV, USER_VIKRAM_DESAI, -480),
  member(TEAM_DIGITAL_QA, USER_PRIYA_NAIR, -655),
  member(TEAM_DIGITAL_SEO, USER_FATIMA_AL_ZAABI, -600),
  member(TEAM_DIGITAL_CONTENT, USER_DANIEL_OKAFOR, -580),
  member(TEAM_DIGITAL_CONTENT, USER_AISHA_KAREEM, -420),
  member(TEAM_DIGITAL_DESIGN, USER_AISHA_KAREEM, -560),
  member(TEAM_DIGITAL_MKT, USER_MARCUS_SILVA, -540),
  member(TEAM_DIGITAL_INHOUSE_MKT, USER_NOOR_HADDAD, -500),
  member(TEAM_DIGITAL_INHOUSE_MKT, USER_MARCUS_SILVA, -300),
  member(TEAM_IT_PROJECTS, USER_HASSAN_IQBAL, -650),
  member(TEAM_IT_PROJECTS, USER_SARA_MUBARAK, -200),
  member(TEAM_IT_SOLUTIONS, USER_SARA_MUBARAK, -460),
];

// ─────────────────────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────────────────────

export let projects: MockProject[] = [
  {
    id: PROJECT_WEBSITE_RELAUNCH,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_DEV,
    name: "GlobalSurf.ae Website Relaunch",
    description:
      "Full rebuild of the corporate site on Next.js with a new design system, CMS-driven content, and a measurable lift in organic entry pages.",
    status: ProjectStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    startDate: iso(-70),
    dueDate: iso(35),
    healthScore: 78,
    ownerId: USER_RASHID_BIN_SALEM,
    createdAt: iso(-75),
    updatedAt: iso(-2),
  },
  {
    id: PROJECT_SEO_GROWTH,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_SEO,
    name: "SEO Growth Programme — Q3",
    description:
      "Quarterly technical and on-page SEO programme covering crawl health, metadata refresh, and a reporting dashboard for the leadership review.",
    status: ProjectStatus.IN_PROGRESS,
    priority: Priority.MEDIUM,
    startDate: iso(-50),
    dueDate: iso(20),
    healthScore: 85,
    ownerId: USER_FATIMA_AL_ZAABI,
    createdAt: iso(-55),
    updatedAt: iso(-1),
  },
  {
    id: PROJECT_BRAND_REFRESH,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_DESIGN,
    name: "Brand Refresh 2026",
    description:
      "New logo system, typographic scale, and a published brand guideline covering print, digital, and event applications.",
    status: ProjectStatus.REVIEW,
    priority: Priority.HIGH,
    startDate: iso(-90),
    dueDate: iso(18),
    healthScore: 62,
    ownerId: USER_AISHA_KAREEM,
    createdAt: iso(-95),
    updatedAt: iso(-3),
  },
  {
    id: PROJECT_CONTENT_HUB,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_CONTENT,
    name: "Content Hub Migration",
    description:
      "Consolidate four legacy blogs into a single taxonomy-driven content hub with redirects and an editorial workflow.",
    status: ProjectStatus.PLANNING,
    priority: Priority.LOW,
    startDate: iso(-10),
    dueDate: iso(80),
    healthScore: 90,
    ownerId: USER_DANIEL_OKAFOR,
    createdAt: iso(-14),
    updatedAt: iso(-4),
  },
  {
    id: PROJECT_ERP_INTEGRATION,
    departmentId: DEPT_IT,
    teamId: TEAM_IT_PROJECTS,
    name: "ERP Integration — Phase 2",
    description:
      "Connect the finance and procurement modules to the operations platform, with a sandbox connector, reconciliation reports, and a cutover runbook.",
    status: ProjectStatus.IN_PROGRESS,
    priority: Priority.CRITICAL,
    startDate: iso(-120),
    dueDate: iso(12),
    healthScore: 44,
    ownerId: USER_HASSAN_IQBAL,
    createdAt: iso(-125),
    updatedAt: iso(-1),
  },
  {
    id: PROJECT_ENDPOINT_SECURITY,
    departmentId: DEPT_IT,
    teamId: TEAM_IT_SOLUTIONS,
    name: "Endpoint Security Rollout",
    description:
      "Fleet-wide EDR agent deployment, disk encryption baseline, and a documented endpoint hardening standard operating procedure.",
    status: ProjectStatus.COMPLETED,
    priority: Priority.MEDIUM,
    startDate: iso(-160),
    dueDate: iso(-10),
    healthScore: 96,
    ownerId: USER_SARA_MUBARAK,
    createdAt: iso(-165),
    updatedAt: iso(-9),
  },
  {
    id: PROJECT_PAID_SOCIAL,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_MKT,
    name: "Paid Social Campaign — Summer",
    description:
      "Summer always-on paid social programme across Meta and LinkedIn. Paused pending a budget decision after the Q3 performance review.",
    status: ProjectStatus.ON_HOLD,
    priority: Priority.MEDIUM,
    startDate: iso(-40),
    dueDate: iso(45),
    healthScore: 55,
    ownerId: USER_MARCUS_SILVA,
    createdAt: iso(-45),
    updatedAt: iso(-9),
  },
  {
    id: PROJECT_INTRANET_DECOMMISSION,
    departmentId: DEPT_IT,
    teamId: TEAM_IT_PROJECTS,
    name: "Legacy Intranet Decommission",
    description:
      "Retire the on-premise intranet after the document archive is exported. Cancelled — folded into the ERP integration workstream.",
    status: ProjectStatus.CANCELLED,
    priority: Priority.LOW,
    startDate: iso(-200),
    dueDate: iso(60),
    healthScore: 30,
    ownerId: USER_OMAR_FARIS,
    createdAt: iso(-210),
    updatedAt: iso(-30),
  },

  // ── Development team portfolio ───────────────────────────────────────────
  {
    id: PROJECT_API_PLATFORM,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_DEV,
    name: "Client API Platform",
    description:
      "Shared REST + webhook platform the client portals integrate against, with versioned contracts, rate limiting, and a published sandbox.",
    status: ProjectStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    startDate: iso(-110),
    dueDate: iso(48),
    healthScore: 74,
    ownerId: USER_RASHID_BIN_SALEM,
    createdAt: iso(-115),
    updatedAt: iso(-1),
  },
  {
    id: PROJECT_BOOKING_ENGINE,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_DEV,
    name: "Booking Engine v2",
    description:
      "Rebuilt availability and reservation flow with server-side pricing rules. Shipped and handed to support at the end of Sprint 18.",
    status: ProjectStatus.COMPLETED,
    priority: Priority.HIGH,
    startDate: iso(-150),
    dueDate: iso(-50),
    healthScore: 92,
    ownerId: USER_RASHID_BIN_SALEM,
    createdAt: iso(-155),
    updatedAt: iso(-50),
  },
  {
    id: PROJECT_MOBILE_APP,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_DEV,
    name: "Companion Mobile App",
    description:
      "React Native companion app for booking management and push notifications. In discovery — scoping and spike work only.",
    status: ProjectStatus.PLANNING,
    priority: Priority.MEDIUM,
    startDate: iso(-8),
    dueDate: iso(120),
    healthScore: 88,
    ownerId: USER_RASHID_BIN_SALEM,
    createdAt: iso(-12),
    updatedAt: iso(-3),
  },
  {
    id: PROJECT_CLIENT_PORTAL,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_DEV,
    name: "Client Portal Self-Service",
    description:
      "Self-service invoice and report downloads for client stakeholders. Paused until the API platform's auth model is finalised.",
    status: ProjectStatus.ON_HOLD,
    priority: Priority.MEDIUM,
    startDate: iso(-60),
    dueDate: iso(70),
    healthScore: 58,
    ownerId: USER_VIKRAM_DESAI,
    createdAt: iso(-65),
    updatedAt: iso(-16),
  },
  {
    id: PROJECT_LEGACY_PLUGIN,
    departmentId: DEPT_DIGITAL,
    teamId: TEAM_DIGITAL_DEV,
    name: "Legacy CMS Plugin Maintenance",
    description:
      "Ongoing patching of the legacy CMS plugin suite. Cancelled — superseded by the website relaunch on Next.js.",
    status: ProjectStatus.CANCELLED,
    priority: Priority.LOW,
    startDate: iso(-180),
    dueDate: iso(-20),
    healthScore: 35,
    ownerId: USER_RASHID_BIN_SALEM,
    createdAt: iso(-185),
    updatedAt: iso(-40),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sprints (Development team only)
//
// Six two-week sprints, back to back. Sprint 17–21 are closed; Sprint 22 is the
// live one — it started 9 days ago and ends in 5 days, so the Development
// Dashboard's "Days Left" badge reads 5 without any hardcoding.
// ─────────────────────────────────────────────────────────────────────────────

export let sprints: MockSprint[] = [
  {
    id: SPRINT_17,
    teamId: TEAM_DIGITAL_DEV,
    projectId: PROJECT_BOOKING_ENGINE,
    name: "Sprint 17",
    goal: "Availability search and pricing rules working end to end in the booking engine.",
    startDate: iso(-79),
    endDate: iso(-66),
    status: "COMPLETED",
    createdAt: iso(-82),
  },
  {
    id: SPRINT_18,
    teamId: TEAM_DIGITAL_DEV,
    projectId: PROJECT_BOOKING_ENGINE,
    name: "Sprint 18",
    goal: "Booking Engine v2 payment flows complete and handed over to support.",
    startDate: iso(-65),
    endDate: iso(-52),
    status: "COMPLETED",
    createdAt: iso(-68),
  },
  {
    id: SPRINT_19,
    teamId: TEAM_DIGITAL_DEV,
    projectId: PROJECT_API_PLATFORM,
    name: "Sprint 19",
    goal: "Publish the v1 API reference and a working integrator sandbox.",
    startDate: iso(-51),
    endDate: iso(-38),
    status: "COMPLETED",
    createdAt: iso(-54),
  },
  {
    id: SPRINT_20,
    teamId: TEAM_DIGITAL_DEV,
    projectId: PROJECT_WEBSITE_RELAUNCH,
    name: "Sprint 20",
    goal: "All relaunch page templates built against the new design system.",
    startDate: iso(-37),
    endDate: iso(-24),
    status: "COMPLETED",
    createdAt: iso(-40),
  },
  {
    id: SPRINT_21,
    teamId: TEAM_DIGITAL_DEV,
    projectId: PROJECT_WEBSITE_RELAUNCH,
    name: "Sprint 21",
    goal: "Site search, structured data, and the enquiry flow ready for content load.",
    startDate: iso(-23),
    endDate: iso(-10),
    status: "COMPLETED",
    createdAt: iso(-26),
  },
  {
    id: SPRINT_22,
    teamId: TEAM_DIGITAL_DEV,
    projectId: PROJECT_WEBSITE_RELAUNCH,
    name: "Sprint 22",
    goal: "Homepage and navigation signed off, portal auth handshake merged.",
    startDate: iso(-9),
    endDate: iso(5),
    status: "ACTIVE",
    createdAt: iso(-12),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Milestones
// ─────────────────────────────────────────────────────────────────────────────

export let milestones: MockMilestone[] = [
  // Website Relaunch
  { id: milestone(1), projectId: PROJECT_WEBSITE_RELAUNCH, name: "Discovery & IA sign-off", dueDate: iso(-45), isCompleted: true, createdAt: iso(-75) },
  { id: milestone(2), projectId: PROJECT_WEBSITE_RELAUNCH, name: "Design sign-off", dueDate: iso(-18), isCompleted: true, createdAt: iso(-75) },
  { id: milestone(3), projectId: PROJECT_WEBSITE_RELAUNCH, name: "Build complete", dueDate: iso(22), isCompleted: false, createdAt: iso(-75) },
  // SEO Growth
  { id: milestone(4), projectId: PROJECT_SEO_GROWTH, name: "Keyword map approved", dueDate: iso(-30), isCompleted: true, createdAt: iso(-55) },
  { id: milestone(5), projectId: PROJECT_SEO_GROWTH, name: "Q3 performance report", dueDate: iso(18), isCompleted: false, createdAt: iso(-55) },
  // Brand Refresh
  { id: milestone(6), projectId: PROJECT_BRAND_REFRESH, name: "Moodboard & direction locked", dueDate: iso(-60), isCompleted: true, createdAt: iso(-95) },
  { id: milestone(7), projectId: PROJECT_BRAND_REFRESH, name: "Logo system finalised", dueDate: iso(6), isCompleted: false, createdAt: iso(-95) },
  { id: milestone(8), projectId: PROJECT_BRAND_REFRESH, name: "Brand guidelines published", dueDate: iso(16), isCompleted: false, createdAt: iso(-95) },
  // Content Hub
  { id: milestone(9), projectId: PROJECT_CONTENT_HUB, name: "Content inventory complete", dueDate: iso(28), isCompleted: false, createdAt: iso(-14) },
  { id: milestone(10), projectId: PROJECT_CONTENT_HUB, name: "Migration cutover", dueDate: iso(72), isCompleted: false, createdAt: iso(-14) },
  // ERP Integration
  { id: milestone(11), projectId: PROJECT_ERP_INTEGRATION, name: "Vendor scoping signed", dueDate: iso(-90), isCompleted: true, createdAt: iso(-125) },
  { id: milestone(12), projectId: PROJECT_ERP_INTEGRATION, name: "Sandbox integration live", dueDate: iso(2), isCompleted: false, createdAt: iso(-125) },
  { id: milestone(13), projectId: PROJECT_ERP_INTEGRATION, name: "Production go-live", dueDate: iso(11), isCompleted: false, createdAt: iso(-125) },
  // Endpoint Security
  { id: milestone(14), projectId: PROJECT_ENDPOINT_SECURITY, name: "Pilot group rollout", dueDate: iso(-60), isCompleted: true, createdAt: iso(-165) },
  { id: milestone(15), projectId: PROJECT_ENDPOINT_SECURITY, name: "Fleet-wide rollout", dueDate: iso(-14), isCompleted: true, createdAt: iso(-165) },
  // Paid Social
  { id: milestone(16), projectId: PROJECT_PAID_SOCIAL, name: "Creative set approved", dueDate: iso(-20), isCompleted: true, createdAt: iso(-45) },
  { id: milestone(17), projectId: PROJECT_PAID_SOCIAL, name: "Campaign launch", dueDate: iso(40), isCompleted: false, createdAt: iso(-45) },
  // Intranet Decommission
  { id: milestone(18), projectId: PROJECT_INTRANET_DECOMMISSION, name: "Document archive exported", dueDate: iso(38), isCompleted: false, createdAt: iso(-210) },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
//
// Coverage notes: every TaskStatus appears at least 3×; all four priorities are
// used; tasks 7 & 8 are subtasks of task 2; several tasks have 2+ assignees;
// tasks 3, 10, 16 and 20 are overdue (dueDate in the past, status not COMPLETED).
// ─────────────────────────────────────────────────────────────────────────────

export let tasks: MockTask[] = [
  {
    id: task(1),
    projectId: PROJECT_WEBSITE_RELAUNCH,
    milestoneId: milestone(1),
    parentTaskId: null,
    title: "Audit current site information architecture",
    description:
      "Crawl the existing site, map every template and URL, and flag pages for keep / merge / retire ahead of the rebuild.",
    status: TaskStatus.COMPLETED,
    priority: Priority.HIGH,
    assigneeIds: [USER_VIKRAM_DESAI],
    watcherIds: [USER_RASHID_BIN_SALEM, USER_LAYLA_AL_MANSOORI],
    dependencyIds: [],
    dueDate: iso(-21),
    estimatedHours: 8,
    isRecurring: false,
    sprintId: SPRINT_21,
    storyPoints: 5,
    createdAt: iso(-70),
    updatedAt: iso(-20),
  },
  {
    id: task(2),
    projectId: PROJECT_WEBSITE_RELAUNCH,
    milestoneId: milestone(3),
    parentTaskId: null,
    title: "Rebuild homepage in Next.js",
    description:
      "Implement the approved homepage design as server components with CMS-driven sections and an image optimisation pass.",
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.CRITICAL,
    assigneeIds: [USER_VIKRAM_DESAI, USER_RASHID_BIN_SALEM],
    watcherIds: [USER_LAYLA_AL_MANSOORI],
    dependencyIds: [task(1)],
    dueDate: iso(6),
    estimatedHours: 20,
    isRecurring: false,
    sprintId: SPRINT_22,
    storyPoints: 8,
    createdAt: iso(-40),
    updatedAt: iso(-1),
  },
  {
    id: task(3),
    projectId: PROJECT_WEBSITE_RELAUNCH,
    milestoneId: milestone(3),
    parentTaskId: null,
    title: "Implement responsive navigation",
    description: "Mega-menu on desktop, drawer on mobile, full keyboard and screen-reader support.",
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    assigneeIds: [USER_VIKRAM_DESAI, USER_RASHID_BIN_SALEM],
    watcherIds: [USER_PRIYA_NAIR],
    dependencyIds: [task(2)],
    dueDate: iso(-2),
    estimatedHours: 10,
    isRecurring: false,
    sprintId: SPRINT_22,
    storyPoints: 5,
    createdAt: iso(-35),
    updatedAt: iso(-2),
  },
  {
    id: task(4),
    projectId: PROJECT_WEBSITE_RELAUNCH,
    milestoneId: milestone(3),
    parentTaskId: null,
    title: "Accessibility audit (WCAG 2.2 AA)",
    description: "Automated axe pass plus manual keyboard and screen-reader review of every new template.",
    status: TaskStatus.TODO,
    priority: Priority.HIGH,
    assigneeIds: [USER_PRIYA_NAIR],
    watcherIds: [USER_VIKRAM_DESAI],
    dependencyIds: [],
    dueDate: iso(12),
    estimatedHours: 12,
    isRecurring: false,
    sprintId: SPRINT_22,
    storyPoints: 5,
    createdAt: iso(-30),
    updatedAt: iso(-6),
  },
  {
    id: task(5),
    projectId: PROJECT_WEBSITE_RELAUNCH,
    milestoneId: null,
    parentTaskId: null,
    title: "Set up visual regression tests",
    description: "Baseline screenshots per breakpoint for the ten highest-traffic templates.",
    status: TaskStatus.BACKLOG,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_PRIYA_NAIR],
    watcherIds: [],
    dependencyIds: [],
    dueDate: iso(20),
    estimatedHours: 8,
    isRecurring: false,
    sprintId: SPRINT_22,
    storyPoints: 3,
    createdAt: iso(-25),
    updatedAt: iso(-25),
  },
  {
    id: task(6),
    projectId: PROJECT_WEBSITE_RELAUNCH,
    milestoneId: milestone(3),
    parentTaskId: null,
    title: "Migrate legacy blog URLs with 301s",
    description: "Build and verify the redirect map so no ranking pages are lost at cutover.",
    status: TaskStatus.REVIEW,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_FATIMA_AL_ZAABI],
    watcherIds: [USER_RASHID_BIN_SALEM],
    dependencyIds: [],
    dueDate: iso(3),
    estimatedHours: 6,
    isRecurring: false,
    sprintId: SPRINT_22,
    storyPoints: 3,
    createdAt: iso(-22),
    updatedAt: iso(-1),
  },
  {
    id: task(7),
    projectId: PROJECT_WEBSITE_RELAUNCH,
    milestoneId: milestone(3),
    parentTaskId: task(2),
    title: "Build hero section component",
    description: "Animated hero with a video poster fallback and a configurable call-to-action pair.",
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    assigneeIds: [USER_VIKRAM_DESAI],
    watcherIds: [],
    dependencyIds: [],
    dueDate: iso(4),
    estimatedHours: 6,
    isRecurring: false,
    sprintId: SPRINT_22,
    storyPoints: 3,
    createdAt: iso(-18),
    updatedAt: iso(-1),
  },
  {
    id: task(8),
    projectId: PROJECT_WEBSITE_RELAUNCH,
    milestoneId: milestone(3),
    parentTaskId: task(2),
    title: "Wire homepage CMS content",
    description: "Model the homepage sections in the CMS and connect them to the new components.",
    status: TaskStatus.TODO,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_DANIEL_OKAFOR],
    watcherIds: [USER_VIKRAM_DESAI],
    dependencyIds: [],
    dueDate: iso(8),
    estimatedHours: 5,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-18),
    updatedAt: iso(-5),
  },
  {
    id: task(9),
    projectId: PROJECT_SEO_GROWTH,
    milestoneId: milestone(4),
    parentTaskId: null,
    title: "Quarterly keyword gap analysis",
    description: "Benchmark against three competitors and produce the Q3 priority keyword set.",
    status: TaskStatus.COMPLETED,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_FATIMA_AL_ZAABI],
    watcherIds: [USER_LAYLA_AL_MANSOORI],
    dependencyIds: [],
    dueDate: iso(-14),
    estimatedHours: 10,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-50),
    updatedAt: iso(-13),
  },
  {
    id: task(10),
    projectId: PROJECT_SEO_GROWTH,
    milestoneId: milestone(5),
    parentTaskId: null,
    title: "Fix crawl errors in Search Console",
    description: "Resolve 4xx/5xx and soft-404 clusters, then request re-indexing for affected sections.",
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    assigneeIds: [USER_FATIMA_AL_ZAABI],
    watcherIds: [],
    dependencyIds: [],
    dueDate: iso(-1),
    estimatedHours: 8,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-30),
    updatedAt: iso(0),
  },
  {
    id: task(11),
    projectId: PROJECT_SEO_GROWTH,
    milestoneId: milestone(5),
    parentTaskId: null,
    title: "Optimise metadata across 20 service pages",
    description: "Rewrite titles, descriptions, and H1s against the approved keyword map.",
    status: TaskStatus.TODO,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_FATIMA_AL_ZAABI, USER_DANIEL_OKAFOR],
    watcherIds: [USER_LAYLA_AL_MANSOORI],
    dependencyIds: [],
    dueDate: iso(10),
    estimatedHours: 14,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-28),
    updatedAt: iso(-7),
  },
  {
    id: task(12),
    projectId: PROJECT_SEO_GROWTH,
    milestoneId: milestone(5),
    parentTaskId: null,
    title: "Build Q3 SEO performance dashboard",
    description: "Looker Studio dashboard combining GA4, Search Console, and rank-tracking data.",
    status: TaskStatus.TESTING,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_MARCUS_SILVA, USER_PRIYA_NAIR],
    watcherIds: [USER_FATIMA_AL_ZAABI],
    dependencyIds: [],
    dueDate: iso(5),
    estimatedHours: 6,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-20),
    updatedAt: iso(-2),
  },
  {
    id: task(13),
    projectId: PROJECT_BRAND_REFRESH,
    milestoneId: milestone(7),
    parentTaskId: null,
    title: "Design new logo lockups",
    description: "Primary, stacked, and monochrome lockups with clear-space and minimum-size rules.",
    status: TaskStatus.REVIEW,
    priority: Priority.HIGH,
    assigneeIds: [USER_AISHA_KAREEM],
    watcherIds: [USER_LAYLA_AL_MANSOORI, USER_KHALID_NASSER],
    dependencyIds: [],
    dueDate: iso(2),
    estimatedHours: 16,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-60),
    updatedAt: iso(-2),
  },
  {
    id: task(14),
    projectId: PROJECT_BRAND_REFRESH,
    milestoneId: milestone(8),
    parentTaskId: null,
    title: "Produce brand guideline document",
    description: "Typography, colour, imagery, tone of voice, and application examples in one publishable PDF.",
    status: TaskStatus.TODO,
    priority: Priority.HIGH,
    assigneeIds: [USER_AISHA_KAREEM],
    watcherIds: [USER_DANIEL_OKAFOR],
    dependencyIds: [task(13)],
    dueDate: iso(15),
    estimatedHours: 18,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-55),
    updatedAt: iso(-8),
  },
  {
    id: task(15),
    projectId: PROJECT_BRAND_REFRESH,
    milestoneId: milestone(6),
    parentTaskId: null,
    title: "Photography art direction brief",
    description: "Shot list, lighting references, and styling notes for the brand photography refresh.",
    status: TaskStatus.COMPLETED,
    priority: Priority.LOW,
    assigneeIds: [USER_AISHA_KAREEM],
    watcherIds: [],
    dependencyIds: [],
    dueDate: iso(-9),
    estimatedHours: 6,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-40),
    updatedAt: iso(-9),
  },
  {
    id: task(16),
    projectId: PROJECT_BRAND_REFRESH,
    milestoneId: milestone(7),
    parentTaskId: null,
    title: "Stakeholder review session prep",
    description: "Assemble the review deck, print boards, and collate the open decisions list.",
    status: TaskStatus.TESTING,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_AISHA_KAREEM, USER_LAYLA_AL_MANSOORI],
    watcherIds: [USER_YUSUF_RAHMAN],
    dependencyIds: [],
    dueDate: iso(-3),
    estimatedHours: 6,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-16),
    updatedAt: iso(-3),
  },
  {
    id: task(17),
    projectId: PROJECT_CONTENT_HUB,
    milestoneId: milestone(9),
    parentTaskId: null,
    title: "Inventory 400 legacy articles",
    description: "Catalogue every legacy article with traffic, backlinks, and a keep / rewrite / retire decision.",
    status: TaskStatus.BACKLOG,
    priority: Priority.LOW,
    assigneeIds: [USER_DANIEL_OKAFOR],
    watcherIds: [USER_FATIMA_AL_ZAABI],
    dependencyIds: [],
    dueDate: iso(25),
    estimatedHours: 12,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-12),
    updatedAt: iso(-12),
  },
  {
    id: task(18),
    projectId: PROJECT_CONTENT_HUB,
    milestoneId: milestone(9),
    parentTaskId: null,
    title: "Define content taxonomy",
    description: "Agree the category and tag structure that the migrated hub will be built around.",
    status: TaskStatus.TODO,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_DANIEL_OKAFOR, USER_FATIMA_AL_ZAABI],
    watcherIds: [],
    dependencyIds: [],
    dueDate: iso(18),
    estimatedHours: 8,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-11),
    updatedAt: iso(-5),
  },
  {
    id: task(19),
    projectId: PROJECT_ERP_INTEGRATION,
    milestoneId: milestone(12),
    parentTaskId: null,
    title: "Map finance module data fields",
    description: "Field-by-field mapping between the ERP finance schema and the operations platform.",
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.CRITICAL,
    assigneeIds: [USER_HASSAN_IQBAL],
    watcherIds: [USER_OMAR_FARIS],
    dependencyIds: [],
    dueDate: iso(4),
    estimatedHours: 16,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-60),
    updatedAt: iso(-1),
  },
  {
    id: task(20),
    projectId: PROJECT_ERP_INTEGRATION,
    milestoneId: milestone(12),
    parentTaskId: null,
    title: "Build sandbox API connector",
    description: "Authenticated connector with retry, idempotency keys, and structured error logging.",
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.CRITICAL,
    assigneeIds: [USER_HASSAN_IQBAL, USER_SARA_MUBARAK],
    watcherIds: [USER_OMAR_FARIS, USER_YUSUF_RAHMAN],
    dependencyIds: [task(19)],
    dueDate: iso(-4),
    estimatedHours: 24,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-55),
    updatedAt: iso(0),
  },
  {
    id: task(21),
    projectId: PROJECT_ERP_INTEGRATION,
    milestoneId: milestone(13),
    parentTaskId: null,
    title: "Draft cutover runbook",
    description: "Hour-by-hour go-live plan with rollback triggers and owner sign-offs.",
    status: TaskStatus.BACKLOG,
    priority: Priority.HIGH,
    assigneeIds: [USER_SARA_MUBARAK],
    watcherIds: [USER_HASSAN_IQBAL],
    dependencyIds: [],
    dueDate: iso(22),
    estimatedHours: 8,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-20),
    updatedAt: iso(-20),
  },
  {
    id: task(22),
    projectId: PROJECT_ERP_INTEGRATION,
    milestoneId: milestone(12),
    parentTaskId: null,
    title: "Load-test integration endpoints",
    description: "Sustained and burst load profiles against the sandbox connector with latency budgets.",
    status: TaskStatus.TESTING,
    priority: Priority.HIGH,
    assigneeIds: [USER_SARA_MUBARAK],
    watcherIds: [],
    dependencyIds: [task(20)],
    dueDate: iso(9),
    estimatedHours: 10,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-18),
    updatedAt: iso(-2),
  },
  {
    id: task(23),
    projectId: PROJECT_ENDPOINT_SECURITY,
    milestoneId: milestone(15),
    parentTaskId: null,
    title: "Deploy EDR agent to all laptops",
    description: "Staged rollout by office with health reporting and an exception process.",
    status: TaskStatus.COMPLETED,
    priority: Priority.HIGH,
    assigneeIds: [USER_SARA_MUBARAK],
    watcherIds: [USER_OMAR_FARIS],
    dependencyIds: [],
    dueDate: iso(-12),
    estimatedHours: 20,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-120),
    updatedAt: iso(-11),
  },
  {
    id: task(24),
    projectId: PROJECT_ENDPOINT_SECURITY,
    milestoneId: milestone(15),
    parentTaskId: null,
    title: "Write endpoint hardening SOP",
    description: "Documented baseline covering disk encryption, patch cadence, and local admin policy.",
    status: TaskStatus.COMPLETED,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_SARA_MUBARAK, USER_OMAR_FARIS],
    watcherIds: [],
    dependencyIds: [],
    dueDate: iso(-8),
    estimatedHours: 8,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-60),
    updatedAt: iso(-8),
  },
  {
    id: task(25),
    projectId: PROJECT_PAID_SOCIAL,
    milestoneId: milestone(16),
    parentTaskId: null,
    title: "Refresh summer creative set",
    description: "Six new statics and two short-form videos sized for Meta and LinkedIn placements.",
    status: TaskStatus.REVIEW,
    priority: Priority.MEDIUM,
    assigneeIds: [USER_MARCUS_SILVA, USER_AISHA_KAREEM],
    watcherIds: [USER_LAYLA_AL_MANSOORI],
    dependencyIds: [],
    dueDate: iso(7),
    estimatedHours: 8,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-30),
    updatedAt: iso(-4),
  },
  {
    id: task(26),
    projectId: PROJECT_PAID_SOCIAL,
    milestoneId: milestone(17),
    parentTaskId: null,
    title: "Rebuild audience segments",
    description: "Rebuild lookalike and retargeting audiences after the consent-mode migration.",
    status: TaskStatus.BACKLOG,
    priority: Priority.LOW,
    assigneeIds: [USER_MARCUS_SILVA],
    watcherIds: [],
    dependencyIds: [],
    dueDate: iso(30),
    estimatedHours: 4,
    isRecurring: true,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-25),
    updatedAt: iso(-25),
  },
  {
    id: task(27),
    projectId: PROJECT_INTRANET_DECOMMISSION,
    milestoneId: milestone(18),
    parentTaskId: null,
    title: "Export intranet document archive",
    description: "Bulk export to the document management system with a checksum manifest.",
    status: TaskStatus.BACKLOG,
    priority: Priority.LOW,
    assigneeIds: [USER_HASSAN_IQBAL],
    watcherIds: [USER_OMAR_FARIS],
    dependencyIds: [],
    dueDate: iso(40),
    estimatedHours: 6,
    isRecurring: false,
    sprintId: null,
    storyPoints: null,
    createdAt: iso(-200),
    updatedAt: iso(-30),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sprint-linked Development-team tasks
//
// Appended (rather than inlined above) so the hand-authored task fixtures stay
// readable. These carry `sprintId` + `storyPoints`, which is what makes the
// Development Dashboard's velocity series and sprint-progress gauge computable:
//
//   Sprint 17 → 62 pts   Sprint 20 → 81 pts
//   Sprint 18 → 74 pts   Sprint 21 → 77 pts (72 here + 5 on task 1)
//   Sprint 19 → 68 pts   Sprint 22 → 69 pts completed so far (still open)
//
// Sprint 22 ends up with 27 tasks: 19 completed, 4 in progress, 1 to do,
// 1 backlog, 1 review, 1 testing (the last six come from tasks 2–7 above).
// A handful of closed tasks were finished a day *after* their sprint end date,
// which is what keeps the on-time-delivery percentage below 100.
// ─────────────────────────────────────────────────────────────────────────────

let devTaskSeq = 100;

/** Compact builder for the sprint backlog above — no milestone, watchers, or dependencies. */
function devTask(
  projectId: string,
  title: string,
  status: TaskStatus,
  priority: Priority,
  assigneeIds: string[],
  sprintId: string,
  storyPoints: number,
  estimatedHours: number | null,
  createdOffset: number,
  updatedOffset: number,
  dueOffset: number,
): MockTask {
  devTaskSeq += 1;
  return {
    id: mockId(KIND.TASK, devTaskSeq),
    projectId,
    milestoneId: null,
    parentTaskId: null,
    title,
    description: null,
    status,
    priority,
    assigneeIds,
    watcherIds: [],
    dependencyIds: [],
    dueDate: iso(dueOffset),
    estimatedHours,
    isRecurring: false,
    sprintId,
    storyPoints,
    createdAt: iso(createdOffset),
    updatedAt: iso(updatedOffset),
  };
}

/** Every sprint task below is closed, except the two explicitly marked otherwise. */
function doneTask(
  projectId: string,
  title: string,
  priority: Priority,
  assigneeIds: string[],
  sprintId: string,
  storyPoints: number,
  createdOffset: number,
  updatedOffset: number,
  dueOffset: number,
): MockTask {
  return devTask(
    projectId,
    title,
    TaskStatus.COMPLETED,
    priority,
    assigneeIds,
    sprintId,
    storyPoints,
    null,
    createdOffset,
    updatedOffset,
    dueOffset,
  );
}

tasks.push(
  // ── Sprint 17 (closed, 62 pts) ────────────────────────────────────────────
  doneTask(PROJECT_BOOKING_ENGINE, "Model the availability calendar schema", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_17, 8, -78, -68, -66),
  doneTask(PROJECT_BOOKING_ENGINE, "Build the availability search endpoint", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_17, 8, -78, -67, -66),
  doneTask(PROJECT_BOOKING_ENGINE, "Implement server-side pricing rules", Priority.CRITICAL, [USER_VIKRAM_DESAI], SPRINT_17, 8, -78, -67, -66),
  doneTask(PROJECT_BOOKING_ENGINE, "Reservation hold and expiry logic", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_17, 8, -77, -68, -66),
  doneTask(PROJECT_API_PLATFORM, "Scaffold the API gateway service", Priority.HIGH, [USER_VIKRAM_DESAI], SPRINT_17, 8, -77, -66, -66),
  doneTask(PROJECT_API_PLATFORM, "Contract-first OpenAPI spec for v1", Priority.MEDIUM, [USER_RASHID_BIN_SALEM], SPRINT_17, 8, -79, -69, -66),
  doneTask(PROJECT_BOOKING_ENGINE, "Seat map selection component", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_17, 5, -76, -67, -66),
  doneTask(PROJECT_API_PLATFORM, "Request validation middleware", Priority.MEDIUM, [USER_RASHID_BIN_SALEM], SPRINT_17, 5, -76, -65, -66),
  doneTask(PROJECT_BOOKING_ENGINE, "Booking confirmation emails", Priority.LOW, [USER_VIKRAM_DESAI], SPRINT_17, 3, -75, -68, -66),
  doneTask(PROJECT_API_PLATFORM, "Health and readiness probes", Priority.LOW, [USER_RASHID_BIN_SALEM], SPRINT_17, 1, -75, -70, -66),

  // ── Sprint 18 (closed, 74 pts) ────────────────────────────────────────────
  doneTask(PROJECT_BOOKING_ENGINE, "Payment capture integration", Priority.CRITICAL, [USER_RASHID_BIN_SALEM], SPRINT_18, 8, -64, -54, -52),
  doneTask(PROJECT_BOOKING_ENGINE, "Refund and partial-refund flow", Priority.HIGH, [USER_VIKRAM_DESAI], SPRINT_18, 8, -64, -53, -52),
  doneTask(PROJECT_BOOKING_ENGINE, "Booking amendment flow", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_18, 8, -64, -54, -52),
  doneTask(PROJECT_BOOKING_ENGINE, "Load-test the reservation endpoint", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_18, 8, -63, -53, -52),
  doneTask(PROJECT_API_PLATFORM, "Token-based API authentication", Priority.CRITICAL, [USER_RASHID_BIN_SALEM], SPRINT_18, 8, -63, -52, -52),
  doneTask(PROJECT_API_PLATFORM, "Per-client rate limiting", Priority.HIGH, [USER_VIKRAM_DESAI], SPRINT_18, 8, -62, -51, -52),
  doneTask(PROJECT_API_PLATFORM, "Webhook delivery with retries", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_18, 8, -62, -53, -52),
  doneTask(PROJECT_BOOKING_ENGINE, "Cutover and handover to support", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_18, 8, -60, -52, -52),
  doneTask(PROJECT_API_PLATFORM, "Idempotency keys on write endpoints", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_18, 5, -60, -55, -52),
  doneTask(PROJECT_BOOKING_ENGINE, "Accessibility fixes on the booking form", Priority.MEDIUM, [USER_PRIYA_NAIR], SPRINT_18, 5, -59, -54, -52),

  // ── Sprint 19 (closed, 68 pts) ────────────────────────────────────────────
  doneTask(PROJECT_API_PLATFORM, "Sandbox environment for client integrators", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_19, 8, -50, -40, -38),
  doneTask(PROJECT_API_PLATFORM, "Publish the API reference site", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_19, 8, -50, -39, -38),
  doneTask(PROJECT_API_PLATFORM, "Structured error envelope", Priority.MEDIUM, [USER_RASHID_BIN_SALEM], SPRINT_19, 8, -50, -40, -38),
  doneTask(PROJECT_API_PLATFORM, "Pagination and filtering conventions", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_19, 8, -49, -39, -38),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Set up the design-system package", Priority.HIGH, [USER_VIKRAM_DESAI], SPRINT_19, 8, -49, -41, -38),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Build the layout primitives and grid", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_19, 8, -48, -40, -38),
  doneTask(PROJECT_API_PLATFORM, "Audit log for API writes", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_19, 8, -47, -37, -38),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Typography and colour token pass", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_19, 5, -47, -41, -38),
  doneTask(PROJECT_API_PLATFORM, "Client onboarding CLI script", Priority.LOW, [USER_RASHID_BIN_SALEM], SPRINT_19, 5, -46, -42, -38),
  doneTask(PROJECT_API_PLATFORM, "Credential rotation runbook", Priority.LOW, [USER_RASHID_BIN_SALEM], SPRINT_19, 2, -45, -43, -38),

  // ── Sprint 20 (closed, 81 pts) ────────────────────────────────────────────
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Build the CMS content model", Priority.HIGH, [USER_VIKRAM_DESAI], SPRINT_20, 8, -36, -26, -24),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Service page template", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_20, 8, -36, -26, -24),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Case study template", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_20, 8, -36, -25, -24),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Blog index and article template", Priority.MEDIUM, [USER_RASHID_BIN_SALEM], SPRINT_20, 8, -35, -25, -24),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Global header and footer", Priority.HIGH, [USER_VIKRAM_DESAI], SPRINT_20, 8, -35, -27, -24),
  doneTask(PROJECT_API_PLATFORM, "Sparse field selection for v1.1", Priority.MEDIUM, [USER_RASHID_BIN_SALEM], SPRINT_20, 8, -34, -26, -24),
  doneTask(PROJECT_API_PLATFORM, "Webhook signature verification", Priority.CRITICAL, [USER_RASHID_BIN_SALEM], SPRINT_20, 8, -34, -24, -24),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Image optimisation pipeline", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_20, 8, -33, -25, -24),
  doneTask(PROJECT_API_PLATFORM, "Connection pooling and query timeouts", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_20, 8, -32, -23, -24),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Form handling and spam protection", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_20, 5, -32, -26, -24),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Cookie consent integration", Priority.LOW, [USER_VIKRAM_DESAI], SPRINT_20, 3, -31, -28, -24),
  doneTask(PROJECT_API_PLATFORM, "Upgrade the platform runtime", Priority.LOW, [USER_RASHID_BIN_SALEM], SPRINT_20, 1, -31, -29, -24),

  // ── Sprint 21 (closed, 72 pts here + 5 pts on task 1 = 77) ────────────────
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Site search across templates", Priority.HIGH, [USER_VIKRAM_DESAI], SPRINT_21, 8, -22, -12, -10),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Sitemap and structured data", Priority.MEDIUM, [USER_RASHID_BIN_SALEM], SPRINT_21, 8, -22, -12, -10),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Contact and enquiry flow", Priority.HIGH, [USER_VIKRAM_DESAI], SPRINT_21, 8, -22, -11, -10),
  doneTask(PROJECT_API_PLATFORM, "Bulk export endpoint", Priority.MEDIUM, [USER_RASHID_BIN_SALEM], SPRINT_21, 8, -21, -12, -10),
  doneTask(PROJECT_API_PLATFORM, "Observability dashboards and alerts", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_21, 8, -21, -13, -10),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Team and careers templates", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_21, 8, -20, -11, -10),
  doneTask(PROJECT_API_PLATFORM, "Schema migration tooling", Priority.MEDIUM, [USER_RASHID_BIN_SALEM], SPRINT_21, 8, -20, -10, -10),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "404 and 500 error templates", Priority.LOW, [USER_VIKRAM_DESAI], SPRINT_21, 8, -19, -9, -10),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Breadcrumbs and secondary navigation", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_21, 5, -18, -13, -10),
  doneTask(PROJECT_API_PLATFORM, "Deprecate the v0 endpoints", Priority.LOW, [USER_RASHID_BIN_SALEM], SPRINT_21, 3, -18, -14, -10),

  // ── Sprint 22 (active — 69 pts completed so far) ──────────────────────────
  doneTask(PROJECT_API_PLATFORM, "Client portal auth handshake", Priority.CRITICAL, [USER_RASHID_BIN_SALEM], SPRINT_22, 8, -9, -6, 5),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Locale and RTL support pass", Priority.HIGH, [USER_VIKRAM_DESAI], SPRINT_22, 8, -9, -5, 5),
  doneTask(PROJECT_API_PLATFORM, "Bulk import endpoint", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_22, 8, -9, -4, 5),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Sticky in-page navigation", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_22, 5, -9, -7, 5),
  doneTask(PROJECT_API_PLATFORM, "Retry policy for outbound webhooks", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_22, 5, -9, -6, 5),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Newsletter signup block", Priority.LOW, [USER_VIKRAM_DESAI], SPRINT_22, 5, -8, -3, 5),
  doneTask(PROJECT_API_PLATFORM, "Query performance pass on search", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_22, 5, -8, -2, 5),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Card and media components", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_22, 3, -9, -8, 5),
  doneTask(PROJECT_API_PLATFORM, "Standardise pagination headers", Priority.LOW, [USER_RASHID_BIN_SALEM], SPRINT_22, 3, -9, -7, 5),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Skip links and landmark roles", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_22, 3, -8, -4, 5),
  doneTask(PROJECT_API_PLATFORM, "Expand the integration test suite", Priority.MEDIUM, [USER_PRIYA_NAIR], SPRINT_22, 3, -8, -3, 5),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Fix layout shift on the hero image", Priority.MEDIUM, [USER_VIKRAM_DESAI], SPRINT_22, 2, -9, -8, 5),
  doneTask(PROJECT_API_PLATFORM, "Tighten the CORS configuration", Priority.HIGH, [USER_RASHID_BIN_SALEM], SPRINT_22, 2, -8, -6, 5),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Print stylesheet for case studies", Priority.LOW, [USER_VIKRAM_DESAI], SPRINT_22, 2, -7, -5, 5),
  doneTask(PROJECT_API_PLATFORM, "Correct the 429 retry-after header", Priority.MEDIUM, [USER_RASHID_BIN_SALEM], SPRINT_22, 2, -6, -3, 5),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Fix broken anchor links in the footer", Priority.LOW, [USER_VIKRAM_DESAI], SPRINT_22, 2, -4, -1, 5),
  doneTask(PROJECT_API_PLATFORM, "Bump the dependency lockfile", Priority.LOW, [USER_RASHID_BIN_SALEM], SPRINT_22, 1, -9, -8, 5),
  doneTask(PROJECT_WEBSITE_RELAUNCH, "Copy fixes on the services page", Priority.LOW, [USER_VIKRAM_DESAI], SPRINT_22, 1, -5, -2, 5),
  doneTask(PROJECT_API_PLATFORM, "Update the sandbox seed data", Priority.LOW, [USER_RASHID_BIN_SALEM], SPRINT_22, 1, -4, -1, 5),
  devTask(PROJECT_API_PLATFORM, "Payment gateway webhook handler", TaskStatus.IN_PROGRESS, Priority.CRITICAL, [USER_RASHID_BIN_SALEM], SPRINT_22, 5, 6, -8, 0, 4),
  devTask(PROJECT_WEBSITE_RELAUNCH, "Cross-browser regression pass on the new templates", TaskStatus.TESTING, Priority.HIGH, [USER_PRIYA_NAIR, USER_VIKRAM_DESAI], SPRINT_22, 3, 4, -7, -1, 3),
);

// ─────────────────────────────────────────────────────────────────────────────
// Bugs (Development-team projects)
//
// 28 defects: 23 raised inside the last 30 days (which is what "Bugs This Month"
// counts) and 5 older ones so the rolling window actually filters something.
// 21 are resolved (FIXED/CLOSED) with a resolution time between 4 hours and
// 3 days; the remaining 7 are still open and carry `resolvedAt: null`.
// ─────────────────────────────────────────────────────────────────────────────

let bugSeq = 0;

/**
 * @param createdOffset  Days from "now" the defect was raised (negative = past).
 * @param resolutionHours Hours from `createdAt` to `resolvedAt`, or null if open.
 */
function bug(
  projectId: string,
  title: string,
  priority: Priority,
  status: MockBugStatus,
  reportedById: string,
  assigneeId: string | null,
  createdOffset: number,
  resolutionHours: number | null,
): MockBug {
  bugSeq += 1;
  const createdAt = iso(createdOffset, 10);
  return {
    id: mockId(KIND.BUG, bugSeq),
    projectId,
    taskId: null,
    title,
    // Seeded defects carry no reproduction notes; only ones raised through the
    // Bugs tab's "Report Bug" form do.
    description: null,
    priority,
    status,
    reportedById,
    assigneeId,
    createdAt,
    resolvedAt:
      resolutionHours === null
        ? null
        : new Date(new Date(createdAt).getTime() + resolutionHours * 3_600_000).toISOString(),
  };
}

export let bugs: MockBug[] = [
  // ── Older than the 30-day window ─────────────────────────────────────────
  bug(PROJECT_BOOKING_ENGINE, "Reservation hold released 60 seconds early", Priority.HIGH, "CLOSED", USER_PRIYA_NAIR, USER_RASHID_BIN_SALEM, -58, 26),
  bug(PROJECT_BOOKING_ENGINE, "Refund total ignores the service fee", Priority.CRITICAL, "CLOSED", USER_PRIYA_NAIR, USER_VIKRAM_DESAI, -52, 14),
  bug(PROJECT_API_PLATFORM, "Rate limiter counts pre-flight requests", Priority.MEDIUM, "CLOSED", USER_RASHID_BIN_SALEM, USER_VIKRAM_DESAI, -45, 48),
  bug(PROJECT_API_PLATFORM, "Webhook retries fire without backoff", Priority.HIGH, "CLOSED", USER_PRIYA_NAIR, USER_RASHID_BIN_SALEM, -38, 20),
  bug(PROJECT_BOOKING_ENGINE, "Seat map misaligned on iPad Safari", Priority.LOW, "CLOSED", USER_PRIYA_NAIR, USER_VIKRAM_DESAI, -34, 30),

  // ── Inside the 30-day window ─────────────────────────────────────────────
  bug(PROJECT_WEBSITE_RELAUNCH, "Mega-menu traps focus behind the overlay", Priority.HIGH, "CLOSED", USER_PRIYA_NAIR, USER_VIKRAM_DESAI, -29, 36),
  bug(PROJECT_WEBSITE_RELAUNCH, "Hero video autoplays on metered connections", Priority.MEDIUM, "CLOSED", USER_PRIYA_NAIR, USER_VIKRAM_DESAI, -28, 22),
  bug(PROJECT_API_PLATFORM, "Cursor pagination skips the last page", Priority.HIGH, "CLOSED", USER_RASHID_BIN_SALEM, USER_RASHID_BIN_SALEM, -28, 9),
  bug(PROJECT_WEBSITE_RELAUNCH, "Breadcrumb shows the raw slug on case studies", Priority.LOW, "FIXED", USER_DANIEL_OKAFOR, USER_VIKRAM_DESAI, -26, 52),
  bug(PROJECT_API_PLATFORM, "500 returned instead of 422 on invalid payloads", Priority.HIGH, "IN_PROGRESS", USER_PRIYA_NAIR, USER_RASHID_BIN_SALEM, -24, null),
  bug(PROJECT_WEBSITE_RELAUNCH, "Service page hero crops on 1366px screens", Priority.MEDIUM, "CLOSED", USER_AISHA_KAREEM, USER_VIKRAM_DESAI, -23, 18),
  bug(PROJECT_API_PLATFORM, "Sandbox tokens expire after 15 minutes", Priority.CRITICAL, "CLOSED", USER_KHALID_NASSER, USER_RASHID_BIN_SALEM, -23, 6),
  bug(PROJECT_CLIENT_PORTAL, "Invoice PDF download returns an empty file", Priority.CRITICAL, "CLOSED", USER_KHALID_NASSER, USER_VIKRAM_DESAI, -23, 44),
  bug(PROJECT_WEBSITE_RELAUNCH, "Sitemap omits paginated blog pages", Priority.MEDIUM, "CLOSED", USER_FATIMA_AL_ZAABI, USER_RASHID_BIN_SALEM, -21, 30),
  bug(PROJECT_API_PLATFORM, "Audit log records the wrong actor for API keys", Priority.MEDIUM, "CLOSED", USER_PRIYA_NAIR, USER_RASHID_BIN_SALEM, -19, 14),
  bug(PROJECT_WEBSITE_RELAUNCH, "Search returns draft CMS entries", Priority.HIGH, "CLOSED", USER_PRIYA_NAIR, USER_VIKRAM_DESAI, -18, 8),
  bug(PROJECT_WEBSITE_RELAUNCH, "Enquiry form loses state on validation error", Priority.HIGH, "CLOSED", USER_PRIYA_NAIR, USER_VIKRAM_DESAI, -16, 26),
  bug(PROJECT_API_PLATFORM, "Bulk export times out above 50k rows", Priority.HIGH, "QA_REVIEW", USER_RASHID_BIN_SALEM, USER_RASHID_BIN_SALEM, -15, null),
  bug(PROJECT_CLIENT_PORTAL, "Report filter resets when switching tabs", Priority.LOW, "CLOSED", USER_KHALID_NASSER, USER_VIKRAM_DESAI, -15, 68),
  bug(PROJECT_WEBSITE_RELAUNCH, "Cookie banner reappears after consent", Priority.MEDIUM, "CLOSED", USER_LAYLA_AL_MANSOORI, USER_VIKRAM_DESAI, -12, 20),
  bug(PROJECT_API_PLATFORM, "Deprecated v0 route still accepts writes", Priority.MEDIUM, "CLOSED", USER_RASHID_BIN_SALEM, USER_RASHID_BIN_SALEM, -11, 12),
  bug(PROJECT_WEBSITE_RELAUNCH, "Mobile drawer scroll lock leaks to the page", Priority.HIGH, "CLOSED", USER_PRIYA_NAIR, USER_VIKRAM_DESAI, -9, 16),
  bug(PROJECT_WEBSITE_RELAUNCH, "Card component drops its focus ring in dark mode", Priority.LOW, "ASSIGNED", USER_AISHA_KAREEM, USER_VIKRAM_DESAI, -8, null),
  bug(PROJECT_API_PLATFORM, "Webhook signature fails on payloads with unicode", Priority.CRITICAL, "CLOSED", USER_PRIYA_NAIR, USER_RASHID_BIN_SALEM, -8, 5),
  bug(PROJECT_WEBSITE_RELAUNCH, "Print stylesheet hides case study images", Priority.LOW, "IN_PROGRESS", USER_DANIEL_OKAFOR, USER_VIKRAM_DESAI, -6, null),
  bug(PROJECT_API_PLATFORM, "Retry-after header returned in milliseconds", Priority.MEDIUM, "QA_REVIEW", USER_PRIYA_NAIR, USER_RASHID_BIN_SALEM, -4, null),
  bug(PROJECT_WEBSITE_RELAUNCH, "Footer anchor links scroll past the target", Priority.LOW, "NEW", USER_PRIYA_NAIR, null, -2, null),
  bug(PROJECT_API_PLATFORM, "Sandbox seed data missing the new pricing fields", Priority.MEDIUM, "NEW", USER_KHALID_NASSER, null, -1, null),
];

// ─────────────────────────────────────────────────────────────────────────────
// Task comments
// ─────────────────────────────────────────────────────────────────────────────

export let taskComments: MockComment[] = [
  {
    id: mockId(KIND.COMMENT, 1),
    taskId: task(2),
    authorId: USER_RASHID_BIN_SALEM,
    body: "Sections are componentised now. Vikram, can you take the CMS wiring while I finish the layout primitives?",
    createdAt: iso(-4, 10, 15),
  },
  {
    id: mockId(KIND.COMMENT, 2),
    taskId: task(2),
    authorId: USER_VIKRAM_DESAI,
    body: "Yes — hero is nearly done, I'll pick up the CMS mapping straight after.",
    createdAt: iso(-3, 11, 40),
  },
  {
    id: mockId(KIND.COMMENT, 3),
    taskId: task(3),
    authorId: USER_PRIYA_NAIR,
    body: "Focus trap on the mobile drawer still lets tab escape to the page behind it. Blocking sign-off.",
    createdAt: iso(-2, 14, 5),
  },
  {
    id: mockId(KIND.COMMENT, 4),
    taskId: task(13),
    authorId: USER_LAYLA_AL_MANSOORI,
    body: "Direction is strong. Please add a monochrome variant before the stakeholder session.",
    createdAt: iso(-5, 9, 30),
  },
  {
    id: mockId(KIND.COMMENT, 5),
    taskId: task(13),
    authorId: USER_AISHA_KAREEM,
    body: "Monochrome lockup added to page 4 of the review deck.",
    createdAt: iso(-2, 16, 20),
  },
  {
    id: mockId(KIND.COMMENT, 6),
    taskId: task(20),
    authorId: USER_HASSAN_IQBAL,
    body: "Vendor sandbox was down for two days, which is why we slipped past the due date. Escalated to Omar.",
    createdAt: iso(-3, 8, 45),
  },
  {
    id: mockId(KIND.COMMENT, 7),
    taskId: task(20),
    authorId: USER_OMAR_FARIS,
    body: "Vendor has confirmed the sandbox is stable again. Re-baseline the date once the connector passes smoke tests.",
    createdAt: iso(-1, 12, 10),
  },
  {
    id: mockId(KIND.COMMENT, 8),
    taskId: task(10),
    authorId: USER_FATIMA_AL_ZAABI,
    body: "Down to 40 remaining soft-404s, mostly on retired service pages. Redirects go out with the relaunch.",
    createdAt: iso(0, 8, 20),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Task activity log
// ─────────────────────────────────────────────────────────────────────────────

export let taskActivityEntries: MockActivityEntry[] = [
  {
    id: mockId(KIND.ACTIVITY, 1),
    taskId: task(2),
    actorId: USER_RASHID_BIN_SALEM,
    field: "status",
    oldValue: TaskStatus.TODO,
    newValue: TaskStatus.IN_PROGRESS,
    createdAt: iso(-12, 9, 5),
  },
  {
    id: mockId(KIND.ACTIVITY, 2),
    taskId: task(2),
    actorId: USER_LAYLA_AL_MANSOORI,
    field: "priority",
    oldValue: Priority.HIGH,
    newValue: Priority.CRITICAL,
    createdAt: iso(-8, 15, 30),
  },
  {
    id: mockId(KIND.ACTIVITY, 3),
    taskId: task(3),
    actorId: USER_VIKRAM_DESAI,
    field: "status",
    oldValue: TaskStatus.TODO,
    newValue: TaskStatus.IN_PROGRESS,
    createdAt: iso(-9, 10, 0),
  },
  {
    id: mockId(KIND.ACTIVITY, 4),
    taskId: task(13),
    actorId: USER_AISHA_KAREEM,
    field: "status",
    oldValue: TaskStatus.IN_PROGRESS,
    newValue: TaskStatus.REVIEW,
    createdAt: iso(-2, 16, 25),
  },
  {
    id: mockId(KIND.ACTIVITY, 5),
    taskId: task(20),
    actorId: USER_HASSAN_IQBAL,
    field: "dueDate",
    oldValue: iso(-14),
    newValue: iso(-4),
    createdAt: iso(-14, 11, 0),
  },
  {
    id: mockId(KIND.ACTIVITY, 6),
    taskId: task(20),
    actorId: USER_SARA_MUBARAK,
    field: "assignee",
    oldValue: null,
    newValue: "Sara Mubarak",
    createdAt: iso(-10, 9, 45),
  },
  {
    id: mockId(KIND.ACTIVITY, 7),
    taskId: task(10),
    actorId: USER_FATIMA_AL_ZAABI,
    field: "status",
    oldValue: TaskStatus.BACKLOG,
    newValue: TaskStatus.IN_PROGRESS,
    createdAt: iso(-20, 13, 15),
  },
  {
    id: mockId(KIND.ACTIVITY, 8),
    taskId: task(23),
    actorId: USER_SARA_MUBARAK,
    field: "status",
    oldValue: TaskStatus.TESTING,
    newValue: TaskStatus.COMPLETED,
    createdAt: iso(-11, 17, 0),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Timesheet entries — spread across the last two weeks
// ─────────────────────────────────────────────────────────────────────────────

let timesheetSeq = 0;
function timesheet(
  employeeId: string,
  dayOffset: number,
  hours: number,
  status: TimesheetStatus,
  projectId: string | null,
  taskId: string | null,
  notes: string,
): MockTimesheetEntry {
  timesheetSeq += 1;
  return {
    id: mockId(KIND.TIMESHEET, timesheetSeq),
    employeeId,
    taskId,
    projectId,
    date: dateOnly(dayOffset),
    hours,
    notes,
    status,
    createdAt: iso(dayOffset, 18),
  };
}

export let timesheetEntries: MockTimesheetEntry[] = [
  // Vikram Desai
  timesheet(USER_VIKRAM_DESAI, 0, 4, TimesheetStatus.SUBMITTED, PROJECT_WEBSITE_RELAUNCH, task(7), "Hero section — video poster fallback and CTA variants."),
  timesheet(USER_VIKRAM_DESAI, -1, 7.5, TimesheetStatus.APPROVED, PROJECT_WEBSITE_RELAUNCH, task(2), "Homepage section components and image optimisation."),
  timesheet(USER_VIKRAM_DESAI, -2, 8, TimesheetStatus.APPROVED, PROJECT_WEBSITE_RELAUNCH, task(3), "Mega-menu keyboard navigation."),
  timesheet(USER_VIKRAM_DESAI, -6, 6, TimesheetStatus.PENDING_APPROVAL, PROJECT_WEBSITE_RELAUNCH, task(3), "Mobile drawer focus management."),
  timesheet(USER_VIKRAM_DESAI, -8, 7, TimesheetStatus.APPROVED, PROJECT_WEBSITE_RELAUNCH, task(2), "Server component refactor of the homepage."),
  timesheet(USER_VIKRAM_DESAI, -11, 5.5, TimesheetStatus.APPROVED, PROJECT_WEBSITE_RELAUNCH, task(1), "IA audit write-up and handover."),

  // Fatima Al Zaabi
  timesheet(USER_FATIMA_AL_ZAABI, 0, 3, TimesheetStatus.SUBMITTED, PROJECT_SEO_GROWTH, task(10), "Soft-404 cleanup and re-indexing requests."),
  timesheet(USER_FATIMA_AL_ZAABI, -2, 6, TimesheetStatus.PENDING_APPROVAL, PROJECT_SEO_GROWTH, task(10), "Crawl error triage across service sections."),
  timesheet(USER_FATIMA_AL_ZAABI, -3, 8, TimesheetStatus.APPROVED, PROJECT_WEBSITE_RELAUNCH, task(6), "Legacy blog redirect map build."),
  timesheet(USER_FATIMA_AL_ZAABI, -9, 7, TimesheetStatus.APPROVED, PROJECT_SEO_GROWTH, task(11), "Metadata rewrites for the first ten service pages."),
  timesheet(USER_FATIMA_AL_ZAABI, -12, 4, TimesheetStatus.APPROVED, PROJECT_SEO_GROWTH, task(9), "Competitor keyword gap benchmarking."),

  // Aisha Kareem
  timesheet(USER_AISHA_KAREEM, -1, 5, TimesheetStatus.SUBMITTED, PROJECT_BRAND_REFRESH, task(13), "Monochrome lockup variants for the review deck."),
  timesheet(USER_AISHA_KAREEM, -4, 7, TimesheetStatus.PENDING_APPROVAL, PROJECT_BRAND_REFRESH, task(16), "Stakeholder review deck assembly and print boards."),
  timesheet(USER_AISHA_KAREEM, -5, 6.5, TimesheetStatus.APPROVED, PROJECT_BRAND_REFRESH, task(13), "Primary and stacked lockup refinement."),
  timesheet(USER_AISHA_KAREEM, -10, 8, TimesheetStatus.APPROVED, PROJECT_PAID_SOCIAL, task(25), "Summer creative statics — first three concepts."),

  // Hassan Iqbal
  timesheet(USER_HASSAN_IQBAL, 0, 8, TimesheetStatus.SUBMITTED, PROJECT_ERP_INTEGRATION, task(20), "Connector retry and idempotency handling."),
  timesheet(USER_HASSAN_IQBAL, -3, 7, TimesheetStatus.APPROVED, PROJECT_ERP_INTEGRATION, task(19), "Finance field mapping — payables and receivables."),
  timesheet(USER_HASSAN_IQBAL, -7, 6, TimesheetStatus.PENDING_APPROVAL, PROJECT_ERP_INTEGRATION, task(20), "Vendor sandbox outage triage and workarounds."),
  timesheet(USER_HASSAN_IQBAL, -13, 5, TimesheetStatus.APPROVED, PROJECT_ERP_INTEGRATION, task(19), "Procurement module schema review."),
];

/** Convenience lookups used by the approval fixtures below. */
const tsVikramPending = timesheetEntries.find(
  (entry) => entry.employeeId === USER_VIKRAM_DESAI && entry.status === TimesheetStatus.PENDING_APPROVAL,
)!;
const tsAishaPending = timesheetEntries.find(
  (entry) => entry.employeeId === USER_AISHA_KAREEM && entry.status === TimesheetStatus.PENDING_APPROVAL,
)!;
const tsHassanPending = timesheetEntries.find(
  (entry) => entry.employeeId === USER_HASSAN_IQBAL && entry.status === TimesheetStatus.PENDING_APPROVAL,
)!;

// ─────────────────────────────────────────────────────────────────────────────
// Approval requests
// ─────────────────────────────────────────────────────────────────────────────

export let approvalRequests: MockApprovalRequest[] = [
  {
    id: mockId(KIND.APPROVAL, 1),
    type: ApprovalType.TIMESHEET,
    status: ApprovalStatus.PENDING,
    requesterId: USER_VIKRAM_DESAI,
    approverId: null,
    entityId: tsVikramPending.id,
    entityLabel: `Timesheet — ${tsVikramPending.hours}h on ${tsVikramPending.date}`,
    projectId: PROJECT_WEBSITE_RELAUNCH,
    comment: null,
    submittedAt: iso(-6, 18),
    decidedAt: null,
    createdAt: iso(-6, 18),
  },
  {
    id: mockId(KIND.APPROVAL, 2),
    type: ApprovalType.TIMESHEET,
    status: ApprovalStatus.PENDING,
    requesterId: USER_AISHA_KAREEM,
    approverId: null,
    entityId: tsAishaPending.id,
    entityLabel: `Timesheet — ${tsAishaPending.hours}h on ${tsAishaPending.date}`,
    projectId: PROJECT_BRAND_REFRESH,
    comment: null,
    submittedAt: iso(-4, 18),
    decidedAt: null,
    createdAt: iso(-4, 18),
  },
  {
    id: mockId(KIND.APPROVAL, 3),
    type: ApprovalType.TIMESHEET,
    status: ApprovalStatus.PENDING,
    requesterId: USER_HASSAN_IQBAL,
    approverId: USER_OMAR_FARIS,
    entityId: tsHassanPending.id,
    entityLabel: `Timesheet — ${tsHassanPending.hours}h on ${tsHassanPending.date}`,
    projectId: PROJECT_ERP_INTEGRATION,
    comment: null,
    submittedAt: iso(-7, 18),
    decidedAt: null,
    createdAt: iso(-7, 18),
  },
  {
    id: mockId(KIND.APPROVAL, 4),
    type: ApprovalType.LEAVE,
    status: ApprovalStatus.PENDING,
    requesterId: USER_DANIEL_OKAFOR,
    approverId: null,
    entityId: mockId(KIND.APPROVAL, 904),
    entityLabel: "Annual leave — 5 days",
    projectId: null,
    comment: "Family travel, cover arranged with Fatima for the metadata work.",
    submittedAt: iso(-2, 10),
    decidedAt: null,
    createdAt: iso(-2, 10),
  },
  {
    id: mockId(KIND.APPROVAL, 5),
    type: ApprovalType.CONTENT,
    status: ApprovalStatus.SUBMITTED,
    requesterId: USER_DANIEL_OKAFOR,
    approverId: null,
    entityId: mockId(KIND.APPROVAL, 905),
    entityLabel: "Blog: “Surfing the AI wave” — editorial sign-off",
    projectId: PROJECT_CONTENT_HUB,
    comment: null,
    submittedAt: iso(-1, 9, 30),
    decidedAt: null,
    createdAt: iso(-1, 9, 30),
  },
  {
    id: mockId(KIND.APPROVAL, 6),
    type: ApprovalType.DESIGN,
    status: ApprovalStatus.APPROVED,
    requesterId: USER_AISHA_KAREEM,
    approverId: USER_LAYLA_AL_MANSOORI,
    entityId: task(13),
    entityLabel: "Brand logo lockup v3",
    projectId: PROJECT_BRAND_REFRESH,
    comment: "Approved — proceed to the guideline build.",
    submittedAt: iso(-8, 11),
    decidedAt: iso(-6, 14),
    createdAt: iso(-8, 11),
  },
  {
    id: mockId(KIND.APPROVAL, 7),
    type: ApprovalType.PROJECT,
    status: ApprovalStatus.REJECTED,
    requesterId: USER_MARCUS_SILVA,
    approverId: USER_LAYLA_AL_MANSOORI,
    entityId: PROJECT_PAID_SOCIAL,
    entityLabel: "Paid Social budget uplift — AED 40,000",
    projectId: PROJECT_PAID_SOCIAL,
    comment: "Rejected for now — revisit after the Q3 performance review.",
    submittedAt: iso(-10, 10),
    decidedAt: iso(-9, 16),
    createdAt: iso(-10, 10),
  },
  {
    id: mockId(KIND.APPROVAL, 8),
    type: ApprovalType.LEAVE,
    status: ApprovalStatus.APPROVED,
    requesterId: USER_SARA_MUBARAK,
    approverId: USER_OMAR_FARIS,
    entityId: mockId(KIND.APPROVAL, 908),
    entityLabel: "Annual leave — 3 days",
    projectId: null,
    comment: "Approved. Handover noted in the rollout tracker.",
    submittedAt: iso(-15, 9),
    decidedAt: iso(-14, 9),
    createdAt: iso(-15, 9),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────

export let notifications: MockNotification[] = [
  {
    id: mockId(KIND.NOTIFICATION, 1),
    userId: USER_VIKRAM_DESAI,
    type: NotificationType.TASK_UPDATE,
    title: "Priya Nair commented on “Implement responsive navigation”",
    body: "Focus trap on the mobile drawer still lets tab escape to the page behind it.",
    link: "/tasks",
    isRead: false,
    createdAt: iso(-2, 14, 6),
  },
  {
    id: mockId(KIND.NOTIFICATION, 2),
    userId: USER_VIKRAM_DESAI,
    type: NotificationType.DUE_DATE_REMINDER,
    title: "“Rebuild homepage in Next.js” is due in 6 days",
    body: "This task is on the critical path for the Build complete milestone.",
    link: "/tasks",
    isRead: false,
    createdAt: iso(0, 7, 30),
  },
  {
    id: mockId(KIND.NOTIFICATION, 3),
    userId: USER_AISHA_KAREEM,
    type: NotificationType.APPROVAL_REQUEST,
    title: "Brand logo lockup v3 was approved",
    body: "Layla Al Mansoori approved your design request. You can proceed to the guideline build.",
    link: "/approvals",
    isRead: true,
    createdAt: iso(-6, 14, 2),
  },
  {
    id: mockId(KIND.NOTIFICATION, 4),
    userId: USER_LAYLA_AL_MANSOORI,
    type: NotificationType.APPROVAL_REQUEST,
    title: "4 approval requests are waiting for your review",
    body: "Two timesheets, one leave request, and one content sign-off from the Digital Department.",
    link: "/approvals",
    isRead: false,
    createdAt: iso(-1, 8, 15),
  },
  {
    id: mockId(KIND.NOTIFICATION, 5),
    userId: USER_LAYLA_AL_MANSOORI,
    type: NotificationType.TEAM_ANNOUNCEMENT,
    title: "Q3 department review moved to Thursday",
    body: "The leadership review has shifted by one day. Please have your delivery numbers ready.",
    link: null,
    isRead: true,
    createdAt: iso(-5, 16, 0),
  },
  {
    id: mockId(KIND.NOTIFICATION, 6),
    userId: USER_YUSUF_RAHMAN,
    type: NotificationType.PROJECT_UPDATE,
    title: "ERP Integration — Phase 2 health dropped to 44",
    body: "A vendor sandbox outage pushed the connector task past its due date.",
    link: `/projects/${PROJECT_ERP_INTEGRATION}`,
    isRead: false,
    createdAt: iso(-1, 9, 0),
  },
  {
    id: mockId(KIND.NOTIFICATION, 7),
    userId: USER_FATIMA_AL_ZAABI,
    type: NotificationType.MENTION,
    title: "Daniel Okafor mentioned you",
    body: "“@Fatima can you confirm the taxonomy will not break the existing category URLs?”",
    link: "/tasks",
    isRead: false,
    createdAt: iso(-3, 11, 20),
  },
  {
    id: mockId(KIND.NOTIFICATION, 8),
    userId: USER_HASSAN_IQBAL,
    type: NotificationType.DUE_DATE_REMINDER,
    title: "“Build sandbox API connector” is 4 days overdue",
    body: "Sandbox integration live is now at risk. Consider re-baselining the milestone.",
    link: "/tasks",
    isRead: false,
    createdAt: iso(0, 8, 0),
  },
  {
    id: mockId(KIND.NOTIFICATION, 9),
    userId: USER_RASHID_BIN_SALEM,
    type: NotificationType.TASK_UPDATE,
    title: "Vikram Desai moved “Build hero section component” to In Progress",
    body: "Two of three homepage subtasks are now underway.",
    link: `/projects/${PROJECT_WEBSITE_RELAUNCH}`,
    isRead: true,
    createdAt: iso(-1, 11, 40),
  },
  {
    id: mockId(KIND.NOTIFICATION, 10),
    userId: USER_SARA_MUBARAK,
    type: NotificationType.PROJECT_UPDATE,
    title: "Endpoint Security Rollout marked Completed",
    body: "All milestones closed. Nice work — final health score 96.",
    link: `/projects/${PROJECT_ENDPOINT_SECURITY}`,
    isRead: true,
    createdAt: iso(-9, 17, 10),
  },
  {
    id: mockId(KIND.NOTIFICATION, 11),
    userId: USER_DANIEL_OKAFOR,
    type: NotificationType.TEAM_ANNOUNCEMENT,
    title: "Content taxonomy workshop on Wednesday",
    body: "Bring your draft category tree — we will lock the top level in this session.",
    link: null,
    isRead: false,
    createdAt: iso(-2, 9, 5),
  },
  {
    id: mockId(KIND.NOTIFICATION, 12),
    userId: USER_OMAR_FARIS,
    type: NotificationType.APPROVAL_REQUEST,
    title: "Hassan Iqbal submitted a timesheet for approval",
    body: `6h logged against ERP Integration — Phase 2 on ${tsHassanPending.date}.`,
    link: "/approvals",
    isRead: false,
    createdAt: iso(-7, 18, 5),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Attachments (with version history)
// ─────────────────────────────────────────────────────────────────────────────

const FILE_GROUP_BRIEF = "grp-website-brief";
const FILE_GROUP_WIREFRAMES = "grp-homepage-wireframes";
const FILE_GROUP_KEYWORD_MAP = "grp-seo-keyword-map";
const FILE_GROUP_BRAND_GUIDELINES = "grp-brand-guidelines";
const FILE_GROUP_ERP_MAPPING = "grp-erp-field-mapping";
const FILE_GROUP_A11Y_NOTES = "grp-a11y-audit-notes";

let attachmentSeq = 0;
function attachment(
  fileGroupId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  version: number,
  uploadedById: string,
  projectId: string | null,
  taskId: string | null,
  dayOffset: number,
): MockAttachment {
  attachmentSeq += 1;
  const scope = projectId ? `projects/${projectId}` : `tasks/${taskId}`;
  return {
    id: mockId(KIND.ATTACHMENT, attachmentSeq),
    fileGroupId,
    fileName,
    mimeType,
    sizeBytes,
    blobPath: `${scope}/v${version}/${fileName}`,
    version,
    uploadedById,
    projectId,
    taskId,
    folderId: null,
    createdAt: iso(dayOffset, 12),
  };
}

export let attachments: MockAttachment[] = [
  attachment(FILE_GROUP_BRIEF, "website-relaunch-brief.pdf", "application/pdf", 842_311, 1, USER_RASHID_BIN_SALEM, PROJECT_WEBSITE_RELAUNCH, null, -70),
  attachment(FILE_GROUP_BRIEF, "website-relaunch-brief.pdf", "application/pdf", 918_744, 2, USER_RASHID_BIN_SALEM, PROJECT_WEBSITE_RELAUNCH, null, -42),
  attachment(FILE_GROUP_WIREFRAMES, "homepage-wireframes-v4.fig", "application/octet-stream", 4_218_903, 1, USER_AISHA_KAREEM, PROJECT_WEBSITE_RELAUNCH, null, -30),
  attachment(FILE_GROUP_KEYWORD_MAP, "seo-keyword-map-q3.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 145_220, 1, USER_FATIMA_AL_ZAABI, PROJECT_SEO_GROWTH, null, -48),
  attachment(FILE_GROUP_KEYWORD_MAP, "seo-keyword-map-q3.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 168_004, 2, USER_FATIMA_AL_ZAABI, PROJECT_SEO_GROWTH, null, -31),
  attachment(FILE_GROUP_KEYWORD_MAP, "seo-keyword-map-q3.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 173_559, 3, USER_FATIMA_AL_ZAABI, PROJECT_SEO_GROWTH, null, -9),
  attachment(FILE_GROUP_BRAND_GUIDELINES, "brand-guidelines-draft.pdf", "application/pdf", 6_402_118, 1, USER_AISHA_KAREEM, PROJECT_BRAND_REFRESH, null, -7),
  attachment(FILE_GROUP_ERP_MAPPING, "erp-field-mapping.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 96_845, 1, USER_HASSAN_IQBAL, PROJECT_ERP_INTEGRATION, null, -20),
  attachment(FILE_GROUP_A11Y_NOTES, "accessibility-audit-notes.md", "text/markdown", 14_902, 1, USER_PRIYA_NAIR, null, task(4), -6),
];

// ─────────────────────────────────────────────────────────────────────────────
// KPI snapshots (historical department performance)
// ─────────────────────────────────────────────────────────────────────────────

let kpiSeq = 0;
function kpi(
  departmentId: string,
  dayOffset: number,
  projectsCompleted: number,
  tasksCompleted: number,
  utilizationPct: number,
  onTimeDeliveryPct: number,
): MockKpiSnapshot {
  kpiSeq += 1;
  return {
    id: mockId(KIND.KPI, kpiSeq),
    departmentId,
    capturedAt: iso(dayOffset, 23),
    projectsCompleted,
    tasksCompleted,
    utilizationPct,
    onTimeDeliveryPct,
  };
}

export let kpiSnapshots: MockKpiSnapshot[] = [
  kpi(DEPT_DIGITAL, -90, 3, 48, 71, 82),
  kpi(DEPT_DIGITAL, -60, 4, 55, 74, 79),
  kpi(DEPT_DIGITAL, -30, 2, 61, 78, 85),
  kpi(DEPT_DIGITAL, -1, 1, 27, 69, 74),
  kpi(DEPT_IT, -90, 1, 22, 64, 88),
  kpi(DEPT_IT, -60, 2, 31, 70, 84),
  kpi(DEPT_IT, -30, 1, 26, 73, 76),
  kpi(DEPT_IT, -1, 1, 14, 72, 68),
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

export function findUser(userId: string | null | undefined): MockUser | undefined {
  if (!userId) return undefined;
  return users.find((user) => user.id === userId);
}

export function findDepartment(departmentId: string | null | undefined): MockDepartment | undefined {
  if (!departmentId) return undefined;
  return departments.find((department) => department.id === departmentId);
}

export function findTeam(teamId: string | null | undefined): MockTeam | undefined {
  if (!teamId) return undefined;
  return teams.find((team) => team.id === teamId);
}

export function findProject(projectId: string | null | undefined): MockProject | undefined {
  if (!projectId) return undefined;
  return projects.find((project) => project.id === projectId);
}

export function findTask(taskId: string | null | undefined): MockTask | undefined {
  if (!taskId) return undefined;
  return tasks.find((t) => t.id === taskId);
}

/** Team ids the given user belongs to. */
export function teamIdsForUser(userId: string): string[] {
  return teamMembers.filter((tm) => tm.userId === userId).map((tm) => tm.teamId);
}
