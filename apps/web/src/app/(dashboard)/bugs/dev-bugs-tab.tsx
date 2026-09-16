"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ImagePlus, LayoutGrid, List as ListIcon, Plus, X } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Priority } from "@/lib/shared";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SearchableProjectDropdown } from "@/components/searchable-project-dropdown";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  BUG_STATUS_LABELS,
  BUG_STATUS_ORDER,
  bugStatusBadgeVariant,
  initials,
  invalidateBugQueries,
  PRIORITY_COLORS,
  PRIORITY_FILTER_ORDER,
  PRIORITY_LABELS,
  priorityBadgeVariant,
  type BugRow,
  type BugStatus,
  type BugsListResponse,
  type DevTeamDetail,
} from "@/lib/dev-shared";
import { BugDetailPanel } from "./bug-detail-panel";

const PAGE_SIZE = 20;
const UNASSIGNED = "UNASSIGNED";

type ViewMode = "list" | "board";
type StatusFilter = BugStatus | "ALL";
type PriorityFilter = Priority | "ALL";

// ─────────────────────────────────────────────────────────────────────────────
// Report Bug dialog
// ─────────────────────────────────────────────────────────────────────────────

const reportBugSchema = z.object({
  projectId: z.string().uuid("Select a project"),
  title: z.string().min(3, "Give the defect a descriptive title"),
  priority: z.nativeEnum(Priority),
  description: z.string().optional(),
});
type ReportBugFormValues = z.infer<typeof reportBugSchema>;

interface BugProjectOption {
  id: string;
  name: string;
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function ReportBugDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: BugProjectOption[];
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
  } = useForm<ReportBugFormValues>({
    resolver: zodResolver(reportBugSchema),
    defaultValues: {
      projectId: defaultProjectId ?? "",
      title: "",
      priority: Priority.MEDIUM,
      description: "",
    },
  });

  // Re-sync the locked-in project whenever the dialog reopens — it stays
  // mounted between opens, so stale values would otherwise linger.
  useEffect(() => {
    if (open) {
      reset({ projectId: defaultProjectId ?? "", title: "", priority: Priority.MEDIUM, description: "" });
    }
  }, [open, defaultProjectId, reset]);

  const lockedProject = defaultProjectId
    ? projects.find((project) => project.id === defaultProjectId)
    : undefined;

  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotFileName, setScreenshotFileName] = useState<string | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  function clearScreenshot() {
    setScreenshotDataUrl(null);
    setScreenshotFileName(null);
  }

  function handleScreenshotChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      toast.error("Screenshot must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setScreenshotDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
    setScreenshotFileName(file.name);
  }

  const reportBugMutation = useMutation({
    mutationFn: (values: ReportBugFormValues) =>
      api.post<BugRow>("/bugs", {
        projectId: values.projectId,
        title: values.title.trim(),
        priority: values.priority,
        description: values.description?.trim() || undefined,
        screenshotUrl: screenshotDataUrl ?? undefined,
      }),
    onSuccess: () => {
      invalidateBugQueries(queryClient);
      toast.success("Bug reported.");
      reset();
      clearScreenshot();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to report bug."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Bug</DialogTitle>
          <DialogDescription>
            Raise a defect against one of the team&apos;s projects. It starts in New, assigned to
            nobody.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((values) => reportBugMutation.mutate(values))}
        >
          {lockedProject ? (
            <div className="flex flex-col gap-1.5">
              <Label>Project</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{lockedProject.name}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bug-project">Project</Label>
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="bug-project">
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
            <Label htmlFor="bug-title">Title</Label>
            <Input id="bug-title" placeholder="What is broken?" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Severity</Label>
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
            <Label htmlFor="bug-description">Description</Label>
            <Textarea
              id="bug-description"
              placeholder="Steps to reproduce, expected vs actual…"
              {...register("description")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Screenshot (optional)</Label>
            <input
              ref={screenshotInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleScreenshotChange}
            />
            {screenshotDataUrl ? (
              <div className="flex items-center gap-3 rounded-md border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- runtime data: URL, not a static asset */}
                <img
                  src={screenshotDataUrl}
                  alt="Screenshot preview"
                  className="h-16 w-16 shrink-0 rounded object-cover"
                />
                <span className="flex-1 truncate text-sm text-muted-foreground">
                  {screenshotFileName}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={clearScreenshot}>
                  <X className="h-4 w-4" />
                  Remove
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => screenshotInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                Attach Screenshot
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                clearScreenshot();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={reportBugMutation.isPending}>
              {reportBugMutation.isPending ? "Reporting…" : "Report Bug"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Board card — the issue-card affordance: severity-coloured spine, title,
// project, assignee avatar. Draggable between status columns.
// ─────────────────────────────────────────────────────────────────────────────

function BugCard({
  bug,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  bug: BugRow;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-md border border-l-4 bg-card p-3 shadow-sm transition-opacity",
        dragging && "opacity-50",
      )}
      // Severity reads at a glance from the spine colour, the way an issue
      // tracker keys its cards. Token reference, so it follows light/dark.
      style={{ borderLeftColor: PRIORITY_COLORS[bug.priority] }}
    >
      <p className="text-sm font-medium leading-snug">{bug.title}</p>
      <p className="truncate text-xs text-muted-foreground">
        {bug.project?.name ?? bug.projectId}
      </p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge variant={priorityBadgeVariant(bug.priority)}>{PRIORITY_LABELS[bug.priority]}</Badge>
          {bug.screenshotUrl && (
            <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has screenshot" />
          )}
        </div>
        {bug.assignee ? (
          <Avatar className="h-7 w-7" title={bug.assignee.fullName}>
            <AvatarFallback>{initials(bug.assignee.fullName)}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Unassigned
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab
// ─────────────────────────────────────────────────────────────────────────────

export function DevBugsTab({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [projectFilter, setProjectFilter] = useState<string | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);
  const [draggingBugId, setDraggingBugId] = useState<string | null>(null);
  const [checkedBugIds, setCheckedBugIds] = useState<Set<string>>(new Set());
  const [bulkAssigneeId, setBulkAssigneeId] = useState<string>(UNASSIGNED);

  // A stale selection spanning a different filtered/paged set is confusing —
  // clear it whenever the underlying page of bugs could have changed.
  useEffect(() => {
    setCheckedBugIds(new Set());
  }, [statusFilter, priorityFilter, projectFilter, page, viewMode]);

  const teamQuery = useQuery({
    queryKey: ["teams", "detail", teamId],
    queryFn: () => api.get<DevTeamDetail>(`/teams/${teamId}`),
    enabled: !!teamId,
    staleTime: 5 * 60_000,
  });
  const teamMembers = teamQuery.data?.members ?? [];

  const bugsQuery = useQuery({
    queryKey: [
      "dev-bugs",
      teamId,
      { status: statusFilter, priority: priorityFilter, project: projectFilter, page },
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (priorityFilter !== "ALL") params.set("priority", priorityFilter);
      if (projectFilter !== "ALL") params.set("projectId", projectFilter);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      return api.get<BugsListResponse>(`/teams/${teamId}/bugs?${params.toString()}`);
    },
    // The board reads from `allBugsQuery` instead, so skip the paged fetch there.
    enabled: !!teamId && viewMode === "list",
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", { teamId, forBugReport: true }],
    queryFn: () =>
      api.get<{ data: BugProjectOption[] }>(`/projects?teamId=${teamId}&pageSize=100`),
    enabled: !!teamId,
  });
  const projectOptions = projectsQuery.data?.data ?? [];

  // Every bug for the team, unfiltered by status/priority/project — feeds both
  // the per-project counts shown above the table and the Board view (a Kanban
  // shows every matching card, not one page of them, so the board filters this
  // set client-side rather than adding a second near-duplicate fetch). Small
  // dataset (one team's worth of bugs), so a single unpaginated fetch is fine.
  const allBugsQuery = useQuery({
    queryKey: ["dev-bugs", teamId, "all-for-counts"],
    queryFn: () => api.get<BugsListResponse>(`/teams/${teamId}/bugs?pageSize=500`),
    enabled: !!teamId,
  });
  const bugCountByProject = new Map<string, number>();
  for (const bug of allBugsQuery.data?.data ?? []) {
    bugCountByProject.set(bug.projectId, (bugCountByProject.get(bug.projectId) ?? 0) + 1);
  }
  const totalBugCount = allBugsQuery.data?.total ?? 0;

  // Same Status/Severity/Project filters the List view applies server-side,
  // applied client-side so the board and the list always agree.
  const boardRows = useMemo(() => {
    let filtered = allBugsQuery.data?.data ?? [];
    if (statusFilter !== "ALL") filtered = filtered.filter((bug) => bug.status === statusFilter);
    if (priorityFilter !== "ALL") {
      filtered = filtered.filter((bug) => bug.priority === priorityFilter);
    }
    if (projectFilter !== "ALL") {
      filtered = filtered.filter((bug) => bug.projectId === projectFilter);
    }
    return filtered;
  }, [allBugsQuery.data, statusFilter, priorityFilter, projectFilter]);

  function selectProject(projectId: string | "ALL") {
    setProjectFilter((current) => (current === projectId ? "ALL" : projectId));
    setPage(1);
  }

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BugStatus }) =>
      api.patch<BugRow>(`/bugs/${id}`, { status }),
    onSuccess: () => {
      invalidateBugQueries(queryClient);
      toast.success("Bug status updated.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to update bug."),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ bugIds, assigneeId }: { bugIds: string[]; assigneeId: string | null }) => {
      await Promise.all(bugIds.map((id) => api.patch(`/bugs/${id}`, { assigneeId })));
    },
    onSuccess: (_data, variables) => {
      invalidateBugQueries(queryClient);
      toast.success(`${variables.bugIds.length} bug${variables.bugIds.length === 1 ? "" : "s"} assigned.`);
      setCheckedBugIds(new Set());
      setBulkAssigneeId(UNASSIGNED);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to assign bugs."),
  });

  function toggleBugChecked(bugId: string) {
    setCheckedBugIds((current) => {
      const next = new Set(current);
      if (next.has(bugId)) next.delete(bugId);
      else next.add(bugId);
      return next;
    });
  }

  function toggleAllOnPage() {
    setCheckedBugIds((current) => {
      const allChecked = rows.length > 0 && rows.every((bug) => current.has(bug.id));
      const next = new Set(current);
      rows.forEach((bug) => (allChecked ? next.delete(bug.id) : next.add(bug.id)));
      return next;
    });
  }

  const total = bugsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = bugsQuery.data?.data ?? [];

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, bugId: string) {
    event.dataTransfer.setData("text/plain", bugId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingBugId(bugId);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, status: BugStatus) {
    event.preventDefault();
    const bugId = event.dataTransfer.getData("text/plain") || draggingBugId;
    const bug = bugId ? boardRows.find((item) => item.id === bugId) : undefined;
    // No-op when the card lands back in the column it came from.
    if (bug && bug.status !== status) {
      updateStatusMutation.mutate({ id: bug.id, status });
    }
    setDraggingBugId(null);
  }

  const isBoardLoading = allBugsQuery.isLoading;
  const isBoardError = allBugsQuery.isError;

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
              count: bugCountByProject.get(project.id) ?? 0,
            }))}
            activeId={projectFilter}
            onSelect={selectProject}
            totalCount={totalBugCount}
            unitLabel="bug"
            isLoading={projectsQuery.isLoading || allBugsQuery.isLoading}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(value) => changeFilter(() => setStatusFilter(value as StatusFilter))}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {BUG_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {BUG_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={priorityFilter}
          onValueChange={(value) => changeFilter(() => setPriorityFilter(value as PriorityFilter))}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All severities</SelectItem>
            {PRIORITY_FILTER_ORDER.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
            variant={viewMode === "board" ? "default" : "ghost"}
            onClick={() => setViewMode("board")}
          >
            <LayoutGrid className="h-4 w-4" />
            Board
          </Button>
        </div>

        <Button onClick={() => setReportOpen(true)}>
          <Plus className="h-4 w-4" />
          Report Bug
        </Button>
      </div>

      {viewMode === "list" && checkedBugIds.size > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-sm font-medium">
              {checkedBugIds.size} bug{checkedBugIds.size === 1 ? "" : "s"} selected
            </span>
            <Select value={bulkAssigneeId} onValueChange={setBulkAssigneeId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Assign to…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={bulkAssignMutation.isPending}
              onClick={() =>
                bulkAssignMutation.mutate({
                  bugIds: Array.from(checkedBugIds),
                  assigneeId: bulkAssigneeId === UNASSIGNED ? null : bulkAssigneeId,
                })
              }
            >
              {bulkAssignMutation.isPending ? "Assigning…" : "Assign"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCheckedBugIds(new Set())}>
              Clear selection
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bug Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          {viewMode === "board" ? (
            isBoardLoading ? (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-48 w-72 shrink-0" />
                ))}
              </div>
            ) : isBoardError ? (
              <p className="text-sm text-destructive">Unable to load bugs.</p>
            ) : boardRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
                <p className="text-sm font-medium">No bugs found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting the filters, or report a new defect.
                </p>
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {BUG_STATUS_ORDER.map((status) => {
                  const columnBugs = boardRows.filter((bug) => bug.status === status);
                  return (
                    <div
                      key={status}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDrop(event, status)}
                      className="flex max-h-[calc(100vh-420px)] w-72 min-h-0 shrink-0 flex-col gap-3 rounded-lg bg-muted/40 p-3"
                    >
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-semibold">{BUG_STATUS_LABELS[status]}</h3>
                        <span className="text-xs text-muted-foreground">{columnBugs.length}</span>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                        {columnBugs.map((bug) => (
                          <BugCard
                            key={bug.id}
                            bug={bug}
                            dragging={draggingBugId === bug.id}
                            onDragStart={(event) => handleDragStart(event, bug.id)}
                            onDragEnd={() => setDraggingBugId(null)}
                            onOpen={() => setSelectedBugId(bug.id)}
                          />
                        ))}
                        {columnBugs.length === 0 && (
                          <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                            Drop bugs here
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : bugsQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : bugsQuery.isError ? (
            <p className="text-sm text-destructive">Unable to load bugs.</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
              <p className="text-sm font-medium">No bugs found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting the filters, or report a new defect.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={rows.length > 0 && rows.every((bug) => checkedBugIds.has(bug.id))}
                      onChange={toggleAllOnPage}
                      aria-label="Select all bugs on this page"
                    />
                  </TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Move to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((bug) => (
                  <TableRow
                    key={bug.id}
                    onClick={() => setSelectedBugId(bug.id)}
                    className="cursor-pointer"
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={checkedBugIds.has(bug.id)}
                        onChange={() => toggleBugChecked(bug.id)}
                        aria-label={`Select ${bug.title}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {bug.title}
                        {bug.screenshotUrl && (
                          <ImagePlus
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-label="Has screenshot"
                          />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {bug.project?.name ?? bug.projectId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityBadgeVariant(bug.priority)}>
                        {PRIORITY_LABELS[bug.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={bugStatusBadgeVariant(bug.status)}>
                        {BUG_STATUS_LABELS[bug.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {bug.reporter?.fullName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {bug.assignee?.fullName ?? "Unassigned"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(bug.createdAt), "d MMM yyyy")}
                    </TableCell>
                    {/* Inline status change stays available in the list — the
                        row click opens the detail slide-over, so the picker
                        must not bubble up to it. */}
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Select
                        value={bug.status}
                        onValueChange={(value) =>
                          updateStatusMutation.mutate({ id: bug.id, status: value as BugStatus })
                        }
                        disabled={updateStatusMutation.isPending}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUG_STATUS_ORDER.map((status) => (
                            <SelectItem key={status} value={status}>
                              {BUG_STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Board view is deliberately unpaginated — a Kanban shows the whole
          set — so the pager belongs to the List view only. */}
      {viewMode === "list" && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} • {total} bug{total === 1 ? "" : "s"}
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

      <ReportBugDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        projects={projectOptions}
        defaultProjectId={projectFilter === "ALL" ? null : projectFilter}
      />

      <Sheet open={!!selectedBugId} onOpenChange={(open) => !open && setSelectedBugId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {selectedBugId && <BugDetailPanel bugId={selectedBugId} teamId={teamId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
