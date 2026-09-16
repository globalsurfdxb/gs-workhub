"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { createTaskSchema, Priority, TaskStatus, type CreateTaskInput } from "@/lib/shared";
import { LayoutGrid, List as ListIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchableProjectDropdown } from "@/components/searchable-project-dropdown";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import {
  formatDate,
  initials,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  priorityBadgeVariant,
  statusBadgeVariant,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  type ProjectsListResponse,
  type TaskListItem,
  type TasksListResponse,
} from "./shared";
import { TaskDetailPanel } from "./task-detail-panel";

type ViewMode = "list" | "kanban";
type AssigneeScope = "me" | "all";
type StatusFilter = TaskStatus | "ALL";
type PriorityFilter = Priority | "ALL";

function AssigneeStack({ assignees }: { assignees: TaskListItem["assignees"] }) {
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

const createTaskFormSchema = createTaskSchema
  .pick({ projectId: true, title: true, description: true, status: true, priority: true })
  .extend({ dueDate: z.string().optional() });
type CreateTaskFormValues = z.infer<typeof createTaskFormSchema>;

interface TaskProjectOption {
  id: string;
  name: string;
}

function NewTaskDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: TaskProjectOption[];
  /** The project card/filter already active on the page, if any — when set,
   * the project picker is skipped entirely instead of asking again. */
  defaultProjectId: string | null;
}) {
  const queryClient = useQueryClient();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTaskFormValues>({
    resolver: zodResolver(createTaskFormSchema),
    defaultValues: {
      projectId: defaultProjectId ?? "",
      title: "",
      description: "",
      status: TaskStatus.BACKLOG,
      priority: Priority.MEDIUM,
      dueDate: "",
    },
  });

  // Re-sync the locked-in project whenever the dialog reopens — it stays
  // mounted between opens, so stale values would otherwise linger.
  useEffect(() => {
    if (open) {
      reset({
        projectId: defaultProjectId ?? "",
        title: "",
        description: "",
        status: TaskStatus.BACKLOG,
        priority: Priority.MEDIUM,
        dueDate: "",
      });
    }
  }, [open, defaultProjectId, reset]);

  const lockedProject = defaultProjectId
    ? projects.find((project) => project.id === defaultProjectId)
    : undefined;

  const createTaskMutation = useMutation({
    mutationFn: (payload: CreateTaskInput) => api.post("/tasks", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
      reset();
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Failed to create task"),
  });

  function onSubmit(values: CreateTaskFormValues) {
    const payload: CreateTaskInput = {
      projectId: values.projectId,
      title: values.title,
      description: values.description || undefined,
      status: values.status,
      priority: values.priority,
      dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
      assigneeIds: [],
      watcherIds: [],
    };
    createTaskMutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>Create a task in a project.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          {lockedProject ? (
            <div className="flex flex-col gap-1.5">
              <Label>Project</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{lockedProject.name}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="projectId">Project</Label>
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="projectId">
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
              {errors.projectId && <p className="text-xs text-destructive">{errors.projectId.message}</p>}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="Task title" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" placeholder="Optional details" {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUS_ORDER.map((status) => (
                        <SelectItem key={status} value={status}>
                          {TASK_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

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
                      {PRIORITY_ORDER.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {PRIORITY_LABELS[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" type="date" {...register("dueDate")} />
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

export default function TasksPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [assigneeScope, setAssigneeScope] = useState<AssigneeScope>("me");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [projectFilter, setProjectFilter] = useState<string | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const assigneeId = assigneeScope === "me" ? user?.id : undefined;

  const filters = useMemo(
    () => ({
      assigneeId,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      priority: priorityFilter === "ALL" ? undefined : priorityFilter,
      projectId: projectFilter === "ALL" ? undefined : projectFilter,
      search: search.trim() || undefined,
    }),
    [assigneeId, statusFilter, priorityFilter, projectFilter, search],
  );

  const tasksQuery = useQuery({
    queryKey: ["tasks", "list", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters.status) params.set("status", filters.status);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.projectId) params.set("projectId", filters.projectId);
      if (filters.search) params.set("search", filters.search);
      params.set("pageSize", "100");
      return api.get<TasksListResponse>(`/tasks?${params.toString()}`);
    },
    enabled: assigneeScope === "all" || !!user?.id,
  });

  // Cheap best-effort project name resolution for the list view — falls back to
  // the raw projectId if a project isn't present in this page of results.
  const projectsQuery = useQuery({
    queryKey: ["projects", "lookup"],
    queryFn: () => api.get<ProjectsListResponse>("/projects?pageSize=100"),
    staleTime: 5 * 60_000,
  });

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    projectsQuery.data?.data.forEach((project) => map.set(project.id, project.name));
    return map;
  }, [projectsQuery.data]);

  // Every task in the current assignee scope, unfiltered by status/priority/
  // project/search — drives the Projects summary panel's per-project counts so
  // they always reflect the full scope, not just the current filtered page.
  const allTasksQuery = useQuery({
    queryKey: ["tasks", "all-for-counts", assigneeScope, assigneeId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (assigneeId) params.set("assigneeId", assigneeId);
      params.set("pageSize", "500");
      return api.get<TasksListResponse>(`/tasks?${params.toString()}`);
    },
    enabled: assigneeScope === "all" || !!user?.id,
  });

  const taskCountByProject = new Map<string, number>();
  for (const task of allTasksQuery.data?.data ?? []) {
    taskCountByProject.set(task.projectId, (taskCountByProject.get(task.projectId) ?? 0) + 1);
  }
  const totalTaskCount = allTasksQuery.data?.meta.total ?? 0;

  // Only projects that actually have a task in the current scope — this is the
  // "assigned projects" list, not every project in the system.
  const projectsWithTasks = (projectsQuery.data?.data ?? []).filter((project) =>
    taskCountByProject.has(project.id),
  );

  function selectProject(projectId: string | "ALL") {
    setProjectFilter((current) => (current === projectId ? "ALL" : projectId));
  }

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Failed to move task"),
  });

  const tasks = tasksQuery.data?.data ?? [];

  function openTask(taskId: string) {
    setSelectedTaskId(taskId);
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, taskId: string) {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(taskId);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, status: TaskStatus) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain") || draggingTaskId;
    if (taskId) {
      updateStatusMutation.mutate({ id: taskId, status });
    }
    setDraggingTaskId(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {assigneeScope === "me" ? "Tasks assigned to you across all projects" : "All tasks across all projects"}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <SearchableProjectDropdown
            options={projectsWithTasks.map((project) => ({
              id: project.id,
              name: project.name,
              count: taskCountByProject.get(project.id) ?? 0,
            }))}
            activeId={projectFilter}
            onSelect={selectProject}
            totalCount={totalTaskCount}
            unitLabel="task"
            isLoading={projectsQuery.isLoading || allTasksQuery.isLoading}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={assigneeScope === "me" ? "default" : "ghost"}
            onClick={() => setAssigneeScope("me")}
          >
            Assigned to me
          </Button>
          <Button
            type="button"
            size="sm"
            variant={assigneeScope === "all" ? "default" : "ghost"}
            onClick={() => setAssigneeScope("all")}
          >
            All tasks
          </Button>
        </div>

        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {TASK_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as PriorityFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All priorities</SelectItem>
            {PRIORITY_ORDER.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />

        <div className="ml-auto flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "list" ? "default" : "ghost"}
            onClick={() => setViewMode("list")}
          >
            <ListIcon className="h-4 w-4" />
            List
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "kanban" ? "default" : "ghost"}
            onClick={() => setViewMode("kanban")}
          >
            <LayoutGrid className="h-4 w-4" />
            Kanban
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tasksQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : tasksQuery.isError ? (
          <p className="text-sm text-destructive">Unable to load tasks.</p>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
            <p className="text-sm font-medium">No tasks found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your filters or create a new task.</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="h-full overflow-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="h-10 px-4">Title</th>
                  <th className="h-10 px-4">Project</th>
                  <th className="h-10 px-4">Status</th>
                  <th className="h-10 px-4">Priority</th>
                  <th className="h-10 px-4">Due Date</th>
                  <th className="h-10 px-4">Assignees</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() => openTask(task.id)}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 font-medium">{task.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {projectNameById.get(task.projectId) ?? task.projectId}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={priorityBadgeVariant(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(task.dueDate)}</td>
                    <td className="px-4 py-3">
                      <AssigneeStack assignees={task.assignees} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-full gap-4 overflow-x-auto pb-2">
            {TASK_STATUS_ORDER.map((status) => {
              const columnTasks = tasks.filter((task) => task.status === status);
              return (
                <div
                  key={status}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, status)}
                  className="flex h-full w-72 min-h-0 shrink-0 flex-col gap-3 rounded-lg bg-muted/40 p-3"
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
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={() => setDraggingTaskId(null)}
                        onClick={() => openTask(task.id)}
                        className={cn(
                          "flex cursor-pointer flex-col gap-2 rounded-md border bg-card p-3 shadow-sm transition-opacity",
                          draggingTaskId === task.id && "opacity-50",
                        )}
                      >
                        <p className="text-sm font-medium leading-snug">{task.title}</p>
                        <div className="flex items-center justify-between">
                          <Badge variant={priorityBadgeVariant(task.priority)}>
                            {PRIORITY_LABELS[task.priority]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>
                        </div>
                        <AssigneeStack assignees={task.assignees} />
                      </div>
                    ))}
                    {columnTasks.length === 0 && (
                      <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                        Drop tasks here
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NewTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={projectsQuery.data?.data ?? []}
        defaultProjectId={projectFilter === "ALL" ? null : projectFilter}
      />

      <Sheet open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {selectedTaskId && <TaskDetailPanel taskId={selectedTaskId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
