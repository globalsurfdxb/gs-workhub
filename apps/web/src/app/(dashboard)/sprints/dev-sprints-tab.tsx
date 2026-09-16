"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Priority, TaskStatus } from "@/lib/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchableProjectDropdown } from "@/components/searchable-project-dropdown";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  initials,
  invalidateSprintQueries,
  PRIORITY_FILTER_ORDER,
  PRIORITY_LABELS,
  priorityBadgeVariant,
  SPRINT_STATUS_LABELS,
  sprintStatusBadgeVariant,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  type DevTaskAssignee,
  type DevTaskRow,
  type DevTasksListResponse,
  type SprintRow,
} from "@/lib/dev-shared";

interface SprintProjectOption {
  id: string;
  name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Sprint dialog
// ─────────────────────────────────────────────────────────────────────────────

const addSprintSchema = z.object({
  projectId: z.string().uuid("Select a project"),
  name: z.string().min(3, "Give the sprint a name"),
  goal: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
});
type AddSprintFormValues = z.infer<typeof addSprintSchema>;

function AddSprintDialog({
  open,
  onOpenChange,
  teamId,
  projects,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  projects: SprintProjectOption[];
  defaultProjectId: string | null;
}) {
  const queryClient = useQueryClient();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddSprintFormValues>({
    resolver: zodResolver(addSprintSchema),
    defaultValues: { projectId: "", name: "", goal: "", startDate: "", endDate: "" },
  });

  // Prefill with the project card selected on the page, if any, every time the
  // dialog opens — the form otherwise stays mounted with stale values between opens.
  useEffect(() => {
    if (open) {
      reset({ projectId: defaultProjectId ?? "", name: "", goal: "", startDate: "", endDate: "" });
    }
  }, [open, defaultProjectId, reset]);

  const lockedProject = defaultProjectId
    ? projects.find((project) => project.id === defaultProjectId)
    : undefined;

  const createSprintMutation = useMutation({
    mutationFn: (values: AddSprintFormValues) =>
      api.post<SprintRow>("/sprints", {
        teamId,
        projectId: values.projectId,
        name: values.name.trim(),
        goal: values.goal?.trim() || undefined,
        startDate: new Date(values.startDate).toISOString(),
        endDate: new Date(values.endDate).toISOString(),
      }),
    onSuccess: () => {
      invalidateSprintQueries(queryClient);
      toast.success("Sprint created.");
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to create sprint."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Sprint</DialogTitle>
          <DialogDescription>Plan a new sprint against one of the team&apos;s projects.</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((values) => createSprintMutation.mutate(values))}
        >
          {lockedProject ? (
            <div className="flex flex-col gap-1.5">
              <Label>Project</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{lockedProject.name}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sprint-project">Project</Label>
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="sprint-project">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.length === 0 ? (
                        <SelectItem value="" disabled>
                          No projects found
                        </SelectItem>
                      ) : (
                        projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.projectId && (
                <p className="text-xs text-destructive">{errors.projectId.message}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sprint-name">Name</Label>
            <Input id="sprint-name" placeholder="Sprint 23" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sprint-goal">Goal</Label>
            <Textarea
              id="sprint-goal"
              placeholder="What should be true by the end of this sprint?"
              {...register("goal")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sprint-start">Start date</Label>
              <Input id="sprint-start" type="date" {...register("startDate")} />
              {errors.startDate && (
                <p className="text-xs text-destructive">{errors.startDate.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sprint-end">End date</Label>
              <Input id="sprint-end" type="date" {...register("endDate")} />
              {errors.endDate && (
                <p className="text-xs text-destructive">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSprintMutation.isPending}>
              {createSprintMutation.isPending ? "Creating…" : "Add Sprint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function shortDate(value: string): string {
  return format(new Date(value), "d MMM yyyy");
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

function AssigneeStack({ assignees }: { assignees: DevTaskAssignee[] }) {
  if (assignees.length === 0) {
    return <span className="text-xs text-muted-foreground">Unassigned</span>;
  }
  const visible = assignees.slice(0, 3);
  const remaining = assignees.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((assignee, index) => (
        <Avatar
          key={assignee.id}
          className={cn("h-7 w-7 border-2 border-background", index > 0 && "-ml-2")}
          title={assignee.user.fullName}
        >
          <AvatarFallback>{initials(assignee.user.fullName)}</AvatarFallback>
        </Avatar>
      ))}
      {remaining > 0 && (
        <span className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium">
          +{remaining}
        </span>
      )}
    </div>
  );
}

/** Invalidates every query a sprint's task composition feeds — the board
 * itself, the sprint cards' points/task counters, and the Dashboard
 * Overview's sprint completion %. */
function invalidateSprintTaskQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["tasks"] });
  queryClient.invalidateQueries({ queryKey: ["dev-sprints"] });
  queryClient.invalidateQueries({ queryKey: ["dev-dashboard"] });
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Existing Task dialog — pulls backlog tasks (same project, no sprint
// yet) into this sprint.
// ─────────────────────────────────────────────────────────────────────────────

function AddExistingTaskDialog({
  open,
  onOpenChange,
  sprintId,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprintId: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const backlogQuery = useQuery({
    queryKey: ["tasks", "backlog-for-sprint", projectId],
    queryFn: () => api.get<DevTasksListResponse>(`/tasks?projectId=${projectId}&pageSize=200`),
    enabled: open,
  });
  const backlogTasks = (backlogQuery.data?.data ?? []).filter((task) => !task.sprintId);

  function toggle(taskId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  const addTasksMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      await Promise.all(taskIds.map((id) => api.patch(`/tasks/${id}`, { sprintId })));
    },
    onSuccess: (_data, taskIds) => {
      invalidateSprintTaskQueries(queryClient);
      toast.success(`${taskIds.length} task${taskIds.length === 1 ? "" : "s"} added to the sprint.`);
      setSelectedIds(new Set());
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to add tasks to the sprint."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Existing Task</DialogTitle>
          <DialogDescription>
            Pull backlog tasks from this project into the sprint.
          </DialogDescription>
        </DialogHeader>

        {backlogQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : backlogQuery.isError ? (
          <p className="text-sm text-destructive">Unable to load this project&apos;s tasks.</p>
        ) : backlogTasks.length === 0 ? (
          <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No unassigned tasks in this project — every task is already in a sprint.
          </p>
        ) : (
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
            {backlogTasks.map((task) => (
              <label
                key={task.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border p-2 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(task.id)}
                  onChange={() => toggle(task.id)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="flex-1 truncate">{task.title}</span>
                <Badge variant={priorityBadgeVariant(task.priority)}>
                  {PRIORITY_LABELS[task.priority]}
                </Badge>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selectedIds.size === 0 || addTasksMutation.isPending}
            onClick={() => addTasksMutation.mutate(Array.from(selectedIds))}
          >
            {addTasksMutation.isPending
              ? "Adding…"
              : selectedIds.size === 0
                ? "Add Tasks"
                : `Add ${selectedIds.size} Task${selectedIds.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New Task dialog — creates a task directly committed to this sprint.
// ─────────────────────────────────────────────────────────────────────────────

const addTaskToSprintSchema = z.object({
  title: z.string().min(3, "Give the task a descriptive title"),
  priority: z.nativeEnum(Priority),
  storyPoints: z.string().optional(),
  dueDate: z.string().optional(),
});
type AddTaskToSprintFormValues = z.infer<typeof addTaskToSprintSchema>;

function AddNewTaskDialog({
  open,
  onOpenChange,
  sprintId,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprintId: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddTaskToSprintFormValues>({
    resolver: zodResolver(addTaskToSprintSchema),
    defaultValues: { title: "", priority: Priority.MEDIUM, storyPoints: "", dueDate: "" },
  });

  const createTaskMutation = useMutation({
    mutationFn: (values: AddTaskToSprintFormValues) =>
      api.post<DevTaskRow>("/tasks", {
        projectId,
        sprintId,
        title: values.title.trim(),
        priority: values.priority,
        status: TaskStatus.TODO,
        storyPoints: values.storyPoints ? Number(values.storyPoints) : undefined,
        dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      invalidateSprintTaskQueries(queryClient);
      toast.success("Task created and added to the sprint.");
      reset();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to create task."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>Creates a task already committed to this sprint.</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((values) => createTaskMutation.mutate(values))}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sprint-task-title">Title</Label>
            <Input id="sprint-task-title" placeholder="Task title" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_FILTER_ORDER.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {PRIORITY_LABELS[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sprint-task-points">Story points</Label>
              <Input
                id="sprint-task-points"
                type="number"
                min={0}
                placeholder="e.g. 5"
                {...register("storyPoints")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sprint-task-due">Due date</Label>
            <Input id="sprint-task-due" type="date" {...register("dueDate")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTaskMutation.isPending}>
              {createTaskMutation.isPending ? "Creating…" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Scrum board for one sprint — same column layout, card style and native
 * HTML5 drag-and-drop as the Tasks page Kanban view, sourced from
 * `GET /tasks?sprintId=`. Dropping a card into another column PATCHes the
 * task's status, so the sprint's completion figures move with it.
 */
function SprintBoard({
  sprintId,
  projectId,
  teamId,
}: {
  sprintId: string;
  projectId: string;
  teamId: string;
}) {
  const queryClient = useQueryClient();
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [addNewOpen, setAddNewOpen] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ["tasks", "sprint", sprintId],
    queryFn: () => api.get<DevTasksListResponse>(`/tasks?sprintId=${sprintId}&pageSize=100`),
  });

  // Other sprints on the same project — the pool a task on this board can be
  // moved into. Sprint moves only make sense within one project's planning.
  const otherSprintsQuery = useQuery({
    queryKey: ["dev-sprints", teamId, "project", projectId],
    queryFn: () => api.get<SprintRow[]>(`/teams/${teamId}/sprints?projectId=${projectId}`),
    enabled: !!teamId && !!projectId,
  });
  const otherSprints = (otherSprintsQuery.data ?? []).filter((sprint) => sprint.id !== sprintId);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => invalidateSprintTaskQueries(queryClient),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to move task."),
  });

  const moveToSprintMutation = useMutation({
    mutationFn: ({ taskId, targetSprintId }: { taskId: string; targetSprintId: string }) =>
      api.patch(`/tasks/${taskId}`, { sprintId: targetSprintId }),
    onSuccess: () => {
      invalidateSprintTaskQueries(queryClient);
      toast.success("Task moved to another sprint.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to move task."),
  });

  function handleDragStart(event: DragEvent<HTMLDivElement>, taskId: string) {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(taskId);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, status: TaskStatus) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
    const task = taskId ? (tasksQuery.data?.data ?? []).find((item) => item.id === taskId) : undefined;
    // No-op when the card lands back in the column it came from.
    if (task && task.status !== status) {
      updateStatusMutation.mutate({ id: task.id, status });
    }
    setDraggingTaskId(null);
  }

  const tasks = tasksQuery.data?.data ?? [];

  const boardContent = tasksQuery.isLoading ? (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-48 w-72 shrink-0" />
      ))}
    </div>
  ) : tasksQuery.isError ? (
    <p className="text-sm text-destructive">Unable to load this sprint&apos;s tasks.</p>
  ) : tasks.length === 0 ? (
    <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
      No tasks are committed to this sprint yet — add one below.
    </p>
  ) : (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {TASK_STATUS_ORDER.map((status) => {
        const columnTasks = tasks.filter((task) => task.status === status);
        return (
          <div
            key={status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, status)}
            className="flex max-h-[50vh] w-72 min-h-0 shrink-0 flex-col gap-3 rounded-lg bg-muted/40 p-3"
          >
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold">{TASK_STATUS_LABELS[status]}</h3>
              <span className="text-xs text-muted-foreground">{columnTasks.length}</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
              {columnTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(event) => handleDragStart(event, task.id)}
                  onDragEnd={() => setDraggingTaskId(null)}
                  className={cn(
                    "flex cursor-grab flex-col gap-2 rounded-md border bg-card p-3 shadow-sm transition-opacity active:cursor-grabbing",
                    draggingTaskId === task.id && "opacity-50",
                  )}
                >
                  <p className="text-sm font-medium leading-snug">{task.title}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant={priorityBadgeVariant(task.priority)}>
                      {PRIORITY_LABELS[task.priority]}
                    </Badge>
                    {task.dueDate && (
                      <span className="text-xs text-muted-foreground">
                        {shortDate(task.dueDate)}
                      </span>
                    )}
                  </div>
                  <AssigneeStack assignees={task.assignees} />
                  {otherSprints.length > 0 && (
                    // Stop the click/drag from also being read as a card drag —
                    // this control lives inside a `draggable` card.
                    <div
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Select
                        value=""
                        onValueChange={(targetSprintId) =>
                          moveToSprintMutation.mutate({ taskId: task.id, targetSprintId })
                        }
                        disabled={moveToSprintMutation.isPending}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Move to sprint…" />
                        </SelectTrigger>
                        <SelectContent>
                          {otherSprints.map((otherSprint) => (
                            <SelectItem key={otherSprint.id} value={otherSprint.id}>
                              {otherSprint.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
              {columnTasks.length === 0 && (
                <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                  Nothing here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setAddExistingOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Existing Task
        </Button>
        <Button type="button" size="sm" onClick={() => setAddNewOpen(true)}>
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {boardContent}

      <AddExistingTaskDialog
        open={addExistingOpen}
        onOpenChange={setAddExistingOpen}
        sprintId={sprintId}
        projectId={projectId}
      />
      <AddNewTaskDialog
        open={addNewOpen}
        onOpenChange={setAddNewOpen}
        sprintId={sprintId}
        projectId={projectId}
      />
    </div>
  );
}

function SprintFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SprintCard({
  sprint,
  expanded,
  onToggle,
  teamId,
}: {
  sprint: SprintRow;
  expanded: boolean;
  onToggle: () => void;
  teamId: string;
}) {
  const queryClient = useQueryClient();
  const isActive = sprint.status === "ACTIVE";
  const pointsPct = pct(sprint.completedPoints, sprint.committedPoints);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/sprints/${sprint.id}`),
    onSuccess: () => {
      invalidateSprintTaskQueries(queryClient);
      toast.success("Sprint deleted. Its tasks moved back to the backlog.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to delete sprint."),
  });

  function handleDelete() {
    if (window.confirm(`Delete "${sprint.name}"? Its tasks will move back to the backlog.`)) {
      deleteMutation.mutate();
    }
  }

  return (
    <Card className={cn(isActive && "border-primary")}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <CardTitle>{sprint.name}</CardTitle>
            <Badge variant={sprintStatusBadgeVariant(sprint.status)}>
              {SPRINT_STATUS_LABELS[sprint.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{sprint.goal}</p>
          <p className="text-xs text-muted-foreground">
            {sprint.project?.name ?? "Unknown project"} · {shortDate(sprint.startDate)} —{" "}
            {shortDate(sprint.endDate)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onToggle}>
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
            {expanded ? "Hide board" : "Sprint board"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            title="Delete sprint"
          >
            <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <SprintFigure
            label="Story points"
            value={`${sprint.completedPoints} / ${sprint.committedPoints}`}
          />
          <SprintFigure
            label="Tasks completed"
            value={`${sprint.completedTasks} / ${sprint.totalTasks}`}
          />
          <SprintFigure label="Points complete" value={`${pointsPct}%`} />
        </div>

        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pointsPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${sprint.name} story points completed`}
        >
          <div
            className={cn("h-full rounded-full", isActive ? "bg-primary" : "bg-success")}
            style={{ width: `${pointsPct}%` }}
          />
        </div>

        {expanded && (
          <div className="border-t border-border pt-4">
            <SprintBoard sprintId={sprint.id} projectId={sprint.projectId} teamId={teamId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DevSprintsTab({ teamId }: { teamId: string }) {
  const [expandedSprintId, setExpandedSprintId] = useState<string | null>(null);
  const [hasTouchedExpansion, setHasTouchedExpansion] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string | "ALL">("ALL");
  const [addSprintOpen, setAddSprintOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sprintsQuery = useQuery({
    queryKey: ["dev-sprints", teamId, { project: projectFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (projectFilter !== "ALL") params.set("projectId", projectFilter);
      const query = params.toString();
      return api.get<SprintRow[]>(`/teams/${teamId}/sprints${query ? `?${query}` : ""}`);
    },
    enabled: !!teamId,
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", { teamId, forSprintPlanning: true }],
    queryFn: () =>
      api.get<{ data: SprintProjectOption[] }>(`/projects?teamId=${teamId}&pageSize=100`),
    enabled: !!teamId,
  });
  const projectOptions = projectsQuery.data?.data ?? [];

  // Every sprint for the team, unfiltered by project — feeds the per-project
  // counts shown above the list (mirrors the Bugs tab's Projects panel).
  const allSprintsQuery = useQuery({
    queryKey: ["dev-sprints", teamId, "all-for-counts"],
    queryFn: () => api.get<SprintRow[]>(`/teams/${teamId}/sprints`),
    enabled: !!teamId,
  });
  const sprintCountByProject = new Map<string, number>();
  for (const sprint of allSprintsQuery.data ?? []) {
    sprintCountByProject.set(sprint.projectId, (sprintCountByProject.get(sprint.projectId) ?? 0) + 1);
  }
  const totalSprintCount = allSprintsQuery.data?.length ?? 0;

  function selectProject(projectId: string | "ALL") {
    setProjectFilter((current) => (current === projectId ? "ALL" : projectId));
  }

  // The endpoint returns sprints oldest first; surface the live sprint at the
  // top, then the rest most-recent first. The search box filters by name or
  // goal text on top of that ordering.
  const ordered = useMemo(() => {
    const rows = sprintsQuery.data ?? [];
    const active = rows.filter((sprint) => sprint.status === "ACTIVE");
    const rest = rows.filter((sprint) => sprint.status !== "ACTIVE").reverse();
    const combined = [...active, ...rest];
    const term = search.trim().toLowerCase();
    if (!term) return combined;
    return combined.filter(
      (sprint) =>
        sprint.name.toLowerCase().includes(term) || sprint.goal.toLowerCase().includes(term),
    );
  }, [sprintsQuery.data, search]);

  const activeSprintId = ordered.find((sprint) => sprint.status === "ACTIVE")?.id ?? null;
  // The active sprint's board is open by default until the user picks another.
  const openSprintId = hasTouchedExpansion ? expandedSprintId : activeSprintId;

  function toggle(sprintId: string) {
    setHasTouchedExpansion(true);
    setExpandedSprintId(openSprintId === sprintId ? null : sprintId);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <SearchableProjectDropdown
            options={projectOptions.map((project) => ({
              id: project.id,
              name: project.name,
              count: sprintCountByProject.get(project.id) ?? 0,
            }))}
            activeId={projectFilter}
            onSelect={selectProject}
            totalCount={totalSprintCount}
            unitLabel="sprint"
            isLoading={projectsQuery.isLoading || allSprintsQuery.isLoading}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Search sprints by name or goal…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-72"
        />
        <Button onClick={() => setAddSprintOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Sprint
        </Button>
      </div>

      {sprintsQuery.isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : sprintsQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Sprints unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            We could not load this team&apos;s sprints. Please refresh the page and try again.
          </CardContent>
        </Card>
      ) : ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium">
            {search.trim() ? "No sprints match your search" : "No sprints yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {search.trim()
              ? "Try a different name or goal keyword."
              : projectFilter === "ALL"
                ? "Sprints appear here once the team plans one."
                : "This project has no sprints yet — add one to get started."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ordered.map((sprint) => (
            <SprintCard
              key={sprint.id}
              sprint={sprint}
              expanded={openSprintId === sprint.id}
              onToggle={() => toggle(sprint.id)}
              teamId={teamId}
            />
          ))}
        </div>
      )}

      <AddSprintDialog
        open={addSprintOpen}
        onOpenChange={setAddSprintOpen}
        teamId={teamId}
        projects={projectOptions}
        defaultProjectId={projectFilter === "ALL" ? null : projectFilter}
      />
    </div>
  );
}
