"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  createProjectSchema,
  isDepartmentLevel,
  isSuperAdminLevel,
  Priority,
  ProjectStatus,
  SystemRole,
  type CreateProjectInput,
  type Department,
  type Team,
} from "@/lib/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import {
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  formatDate,
  healthScoreBadgeVariant,
  priorityBadgeVariant,
  projectStatusBadgeVariant,
  toIsoDateTime,
} from "./_lib/project-ui";

const PAGE_SIZE = 20;

interface ProjectListItem {
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
  _count: { tasks: number; milestones: number };
}

interface ProjectsListResponse {
  data: ProjectListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const projectFormSchema = z.object({
  departmentId: z.string().uuid("Select a department"),
  teamId: z.string().optional(),
  name: z.string().min(2, "Name is too short").max(200),
  description: z.string().max(5000).optional(),
  priority: z.nativeEnum(Priority),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  ownerId: z.string().uuid("Enter a valid owner UUID"),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

const NO_TEAM = "none";

export default function ProjectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isDepartmentHead = currentUser?.role === SystemRole.DEPARTMENT_HEAD;
  const canSeeAllProjects =
    isSuperAdminLevel(currentUser?.role) ||
    currentUser?.role === SystemRole.DEPARTMENT_MANAGER ||
    currentUser?.role === SystemRole.TEAM_LEAD;
  const canCreateProject = isDepartmentLevel(currentUser?.role);

  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
  });

  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/teams"),
  });

  const departmentsById = new Map<string, Department>((departmentsQuery.data ?? []).map((d) => [d.id, d]));
  const teamsById = new Map<string, Team>((teamsQuery.data ?? []).map((t) => [t.id, t]));

  const params = new URLSearchParams();
  if (statusFilter !== "ALL") params.set("status", statusFilter);
  if (priorityFilter !== "ALL") params.set("priority", priorityFilter);
  if (search.trim()) params.set("search", search.trim());
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));

  const projectsQuery = useQuery({
    queryKey: ["projects", { status: statusFilter, priority: priorityFilter, search, page }],
    queryFn: () => api.get<ProjectsListResponse>(`/projects?${params.toString()}`),
  });

  const totalPages = Math.max(1, Math.ceil((projectsQuery.data?.total ?? 0) / PAGE_SIZE));

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      departmentId: isDepartmentHead ? currentUser?.departmentId ?? "" : "",
      teamId: NO_TEAM,
      name: "",
      description: "",
      priority: Priority.MEDIUM,
      startDate: "",
      dueDate: "",
      ownerId: "",
    },
  });

  const selectedDepartmentId = watch("departmentId");
  const availableTeams = (teamsQuery.data ?? []).filter(
    (team) => !selectedDepartmentId || team.departmentId === selectedDepartmentId,
  );

  const createMutation = useMutation({
    mutationFn: (payload: CreateProjectInput) => api.post("/projects", payload),
    onSuccess: () => {
      toast.success("Project created");
      setCreateOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to create project.");
    },
  });

  const onSubmit = (values: ProjectFormValues) => {
    try {
      const payload = createProjectSchema.parse({
        departmentId: values.departmentId,
        teamId: values.teamId && values.teamId !== NO_TEAM ? values.teamId : undefined,
        name: values.name,
        description: values.description?.trim() ? values.description.trim() : undefined,
        priority: values.priority,
        startDate: toIsoDateTime(values.startDate),
        dueDate: toIsoDateTime(values.dueDate),
        ownerId: values.ownerId,
      });
      createMutation.mutate(payload);
    } catch {
      toast.error("Please double-check the form fields.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {canSeeAllProjects
              ? "Track delivery across departments and teams."
              : isDepartmentHead
                ? "Showing projects in your department."
                : "Showing projects you own or have tasks assigned in."}
          </p>
        </div>
        {canCreateProject && (
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) reset();
            }}
          >
            <DialogTrigger asChild>
              <Button>New Project</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Project</DialogTitle>
              </DialogHeader>
              <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="departmentId">Department</Label>
                    <Controller
                      control={control}
                      name="departmentId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange} disabled={isDepartmentHead}>
                          <SelectTrigger id="departmentId">
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {(departmentsQuery.data ?? []).map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  {errors.departmentId && <p className="text-xs text-destructive">{errors.departmentId.message}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="teamId">Team (optional)</Label>
                  <Controller
                    control={control}
                    name="teamId"
                    render={({ field }) => (
                      <Select value={field.value ?? NO_TEAM} onValueChange={field.onChange}>
                        <SelectTrigger id="teamId">
                          <SelectValue placeholder="No team" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_TEAM}>No team (whole department)</SelectItem>
                          {availableTeams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave as "No team" for a department-wide initiative — you don't need a separate project per team.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Project name</Label>
                <Input id="name" placeholder="e.g. Website Relaunch" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea id="description" rows={3} placeholder="What is this project about?" {...register("description")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="priority">Priority</Label>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(Priority).map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {PRIORITY_LABELS[priority]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="startDate">Start date</Label>
                  <Input id="startDate" type="date" {...register("startDate")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dueDate">Due date</Label>
                  <Input id="dueDate" type="date" {...register("dueDate")} />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ownerId">Owner ID (UUID)</Label>
                <Input id="ownerId" placeholder="00000000-0000-0000-0000-000000000000" {...register("ownerId")} />
                {errors.ownerId && <p className="text-xs text-destructive">{errors.ownerId.message}</p>}
              </div>

              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating…" : "Create Project"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <Label htmlFor="search" className="text-xs text-muted-foreground">
              Search
            </Label>
            <Input
              id="search"
              placeholder="Search projects by name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as ProjectStatus | "ALL");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {Object.values(ProjectStatus).map((status) => (
                  <SelectItem key={status} value={status}>
                    {PROJECT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Priority</Label>
            <Select
              value={priorityFilter}
              onValueChange={(value) => {
                setPriorityFilter(value as Priority | "ALL");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All priorities</SelectItem>
                {Object.values(Priority).map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {projectsQuery.isLoading ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : projectsQuery.isError ? (
            <p className="p-6 text-sm text-destructive">Failed to load projects.</p>
          ) : (projectsQuery.data?.data.length ?? 0) === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No projects match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectsQuery.data?.data.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    <TableCell className="font-medium">
                      <Link href={`/projects/${project.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>{departmentsById.get(project.departmentId)?.name ?? "—"}</TableCell>
                    <TableCell>{project.teamId ? teamsById.get(project.teamId)?.name ?? "—" : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={projectStatusBadgeVariant(project.status)}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityBadgeVariant(project.priority)}>{PRIORITY_LABELS[project.priority]}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(project.dueDate)}</TableCell>
                    <TableCell>
                      <Badge variant={healthScoreBadgeVariant(project.healthScore)}>{project.healthScore}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(projectsQuery.data?.total ?? 0) > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} • {projectsQuery.data?.total} project{projectsQuery.data?.total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
