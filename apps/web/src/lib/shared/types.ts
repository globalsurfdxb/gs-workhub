import {
  ApprovalStatus,
  ApprovalType,
  EmployeeAvailability,
  NotificationType,
  Priority,
  ProjectMethodology,
  ProjectStatus,
  SystemRole,
  TaskStatus,
  TimesheetStatus,
} from "./enums";

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  managerId?: string | null;
  headId?: string | null;
  isArchived: boolean;
  createdAt: string;
}

export interface Team {
  id: string;
  departmentId: string;
  name: string;
  code: string;
  teamLeadId?: string | null;
  capacityHoursPerWeek: number;
  methodology: ProjectMethodology;
  isArchived: boolean;
  createdAt: string;
}

export interface EmployeeSummary {
  id: string;
  fullName: string;
  email: string;
  designation?: string | null;
  departmentId?: string | null;
  teamIds: string[];
  role: SystemRole;
  availability: EmployeeAvailability;
  capacityHoursPerWeek: number;
  avatarUrl?: string | null;
}

export interface Project {
  id: string;
  departmentId: string;
  teamId?: string | null;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  priority: Priority;
  startDate?: string | null;
  dueDate?: string | null;
  healthScore: number;
  ownerId: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  dueDate?: string | null;
  isCompleted: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  milestoneId?: string | null;
  parentTaskId?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeIds: string[];
  watcherIds: string[];
  dueDate?: string | null;
  estimatedHours?: number | null;
  isRecurring: boolean;
}

export interface TimesheetEntry {
  id: string;
  employeeId: string;
  taskId?: string | null;
  taskTitle?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  date: string;
  hours: number;
  notes?: string | null;
  status: TimesheetStatus;
}

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  requesterId: string;
  approverId?: string | null;
  entityId: string;
  entityLabel: string;
  submittedAt?: string | null;
  decidedAt?: string | null;
  comment?: string | null;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  link?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  role: SystemRole;
  departmentId?: string | null;
  teamIds: string[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WorkloadSummary {
  employeeId: string;
  employeeName: string;
  capacityHours: number;
  allocatedHours: number;
  utilizationPct: number;
  status: "OVERLOADED" | "OPTIMAL" | "UNDERUTILIZED";
}
