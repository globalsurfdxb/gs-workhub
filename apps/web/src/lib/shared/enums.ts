// Enum values mirror apps/api/prisma/schema.prisma exactly — keep the two in sync.

export enum SystemRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  MANAGER = "MANAGER",
  GENERAL_MANAGER = "GENERAL_MANAGER",
  DEPARTMENT_MANAGER = "DEPARTMENT_MANAGER",
  DEPARTMENT_HEAD = "DEPARTMENT_HEAD",
  TEAM_LEAD = "TEAM_LEAD",
  EMPLOYEE = "EMPLOYEE",
  CLIENT = "CLIENT",
}

/**
 * Roles with the same organization-wide access as Super Admin. Manager and
 * General Manager were added as additional top-level roles (distinct people,
 * same permissions) rather than aliases, so every Super-Admin-only gate must
 * check membership in this set instead of comparing to SUPER_ADMIN alone.
 */
export const SUPER_ADMIN_LEVEL_ROLES: SystemRole[] = [
  SystemRole.SUPER_ADMIN,
  SystemRole.MANAGER,
  SystemRole.GENERAL_MANAGER,
];

export function isSuperAdminLevel(role?: SystemRole | string | null): boolean {
  return !!role && (SUPER_ADMIN_LEVEL_ROLES as string[]).includes(role);
}

/**
 * Every role with department-or-above administrative standing: the
 * org-wide admin tier plus Department Manager (org-wide-assignable but
 * department-branded) and Department Head (strictly scoped to their own
 * department — see `isDepartmentHead`). Used for gates like "who can create
 * a project" that stop at the department level and exclude Team Lead/Employee.
 */
export const DEPARTMENT_LEVEL_ROLES: SystemRole[] = [
  ...SUPER_ADMIN_LEVEL_ROLES,
  SystemRole.DEPARTMENT_MANAGER,
  SystemRole.DEPARTMENT_HEAD,
];

export function isDepartmentLevel(role?: SystemRole | string | null): boolean {
  return !!role && (DEPARTMENT_LEVEL_ROLES as string[]).includes(role);
}

export enum ProjectStatus {
  PLANNING = "PLANNING",
  IN_PROGRESS = "IN_PROGRESS",
  ON_HOLD = "ON_HOLD",
  REVIEW = "REVIEW",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum Priority {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum ProjectMethodology {
  AGILE = "AGILE",
  KANBAN = "KANBAN",
  WATERFALL = "WATERFALL",
}

export enum TaskStatus {
  BACKLOG = "BACKLOG",
  TODO = "TODO",
  IN_PROGRESS = "IN_PROGRESS",
  REVIEW = "REVIEW",
  TESTING = "TESTING",
  COMPLETED = "COMPLETED",
}

export enum TaskViewType {
  LIST = "LIST",
  KANBAN = "KANBAN",
  CALENDAR = "CALENDAR",
  TIMELINE = "TIMELINE",
  GANTT = "GANTT",
}

export enum ApprovalType {
  TIMESHEET = "TIMESHEET",
  LEAVE = "LEAVE",
  TASK = "TASK",
  CONTENT = "CONTENT",
  DESIGN = "DESIGN",
  PROJECT = "PROJECT",
}

export enum ApprovalStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum TimesheetStatus {
  SUBMITTED = "SUBMITTED",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum NotificationType {
  TASK_UPDATE = "TASK_UPDATE",
  PROJECT_UPDATE = "PROJECT_UPDATE",
  APPROVAL_REQUEST = "APPROVAL_REQUEST",
  DUE_DATE_REMINDER = "DUE_DATE_REMINDER",
  TEAM_ANNOUNCEMENT = "TEAM_ANNOUNCEMENT",
  MENTION = "MENTION",
}

export enum EmployeeAvailability {
  AVAILABLE = "AVAILABLE",
  PARTIALLY_AVAILABLE = "PARTIALLY_AVAILABLE",
  UNAVAILABLE = "UNAVAILABLE",
  ON_LEAVE = "ON_LEAVE",
}

/** What kind of access a stored credential unlocks — shown as a badge in the Credentials tab. */
export enum CredentialCategory {
  SERVER = "SERVER",
  CPANEL = "CPANEL",
  DOMAIN = "DOMAIN",
  CMS = "CMS",
  DATABASE = "DATABASE",
  FTP = "FTP",
  EMAIL = "EMAIL",
  OTHER = "OTHER",
}
