import { z } from "zod";
import { Priority, ProjectMethodology, ProjectStatus, TaskStatus } from "./enums";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(150),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only"),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const createDepartmentSchema = z.object({
  name: z.string().min(2).max(120),
  code: z
    .string()
    .min(2)
    .max(12)
    .regex(/^[A-Z0-9_-]+$/, "Code must be uppercase letters, numbers, - or _"),
  description: z.string().max(1000).optional(),
  managerId: z.string().uuid().optional(),
  headId: z.string().uuid().optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const createTeamSchema = z.object({
  departmentId: z.string().uuid(),
  name: z.string().min(2).max(120),
  code: z
    .string()
    .min(2)
    .max(12)
    .regex(/^[A-Z0-9_-]+$/),
  teamLeadId: z.string().uuid().optional(),
  capacityHoursPerWeek: z.number().min(0).max(10000).default(40),
  methodology: z.nativeEnum(ProjectMethodology).default(ProjectMethodology.AGILE),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const createProjectSchema = z.object({
  departmentId: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.PLANNING),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  ownerId: z.string().uuid(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid().optional(),
  parentTaskId: z.string().uuid().optional(),
  title: z.string().min(2).max(300),
  description: z.string().max(10000).optional(),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.BACKLOG),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  assigneeIds: z.array(z.string().uuid()).default([]),
  watcherIds: z.array(z.string().uuid()).default([]),
  dueDate: z.string().datetime().optional(),
  estimatedHours: z.number().min(0).max(1000).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const createTimesheetEntrySchema = z.object({
  taskId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  date: z.string().date(),
  hours: z.number().min(0.25).max(24),
  notes: z.string().max(1000).optional(),
});
export type CreateTimesheetEntryInput = z.infer<typeof createTimesheetEntrySchema>;
