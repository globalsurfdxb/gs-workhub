"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
} from "date-fns";
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createTimesheetEntrySchema,
  isDepartmentLevel,
  SystemRole,
  TimesheetStatus,
  type CreateTimesheetEntryInput,
  type TimesheetEntry,
} from "@/lib/shared";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchableProjectDropdown } from "@/components/searchable-project-dropdown";
import { TaskDetailPanel } from "../tasks/task-detail-panel";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

const DATE_FORMAT = "yyyy-MM-dd";
const NO_PROJECT_SELECTED = "ALL";
const ALL_EMPLOYEES = "ALL";

interface ProjectOption {
  id: string;
  name: string;
}

interface ProjectsListResponse {
  data: ProjectOption[];
}

interface EmployeeOption {
  id: string;
  fullName: string;
}

interface EmployeesListResponse {
  data: EmployeeOption[];
}

const statusVariant: Record<TimesheetStatus, "secondary" | "warning" | "success" | "destructive"> = {
  [TimesheetStatus.SUBMITTED]: "secondary",
  [TimesheetStatus.PENDING_APPROVAL]: "warning",
  [TimesheetStatus.APPROVED]: "success",
  [TimesheetStatus.REJECTED]: "destructive",
};

const statusLabel: Record<TimesheetStatus, string> = {
  [TimesheetStatus.SUBMITTED]: "Submitted",
  [TimesheetStatus.PENDING_APPROVAL]: "Pending approval",
  [TimesheetStatus.APPROVED]: "Approved",
  [TimesheetStatus.REJECTED]: "Rejected",
};

function emptyFormValues(): CreateTimesheetEntryInput {
  return {
    date: format(new Date(), DATE_FORMAT),
    hours: 1,
    projectId: undefined,
    taskId: undefined,
    notes: undefined,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export default function TimesheetsPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  // Team Lead and every department-level-and-above role can review a
  // project's team timesheets, not just their own — see the "Team
  // Timesheets" toggle below.
  const canViewTeam = isDepartmentLevel(user?.role) || user?.role === SystemRole.TEAM_LEAD;

  const [viewScope, setViewScope] = useState<"me" | "team">("me");
  const isTeamView = canViewTeam && viewScope === "team";
  const [teamProjectId, setTeamProjectId] = useState(NO_PROJECT_SELECTED);
  const [teamEmployeeId, setTeamEmployeeId] = useState(ALL_EMPLOYEES);
  const hasTeamProject = teamProjectId !== NO_PROJECT_SELECTED;
  const hasTeamEmployee = teamEmployeeId !== ALL_EMPLOYEES;

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const dateFrom = format(weekStart, DATE_FORMAT);
  const dateTo = format(weekEnd, DATE_FORMAT);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const form = useForm<CreateTimesheetEntryInput>({
    resolver: zodResolver(createTimesheetEntrySchema),
    defaultValues: emptyFormValues(),
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", "for-timesheets"],
    queryFn: () => api.get<ProjectsListResponse>("/projects?pageSize=200"),
    enabled: isTeamView,
  });
  const projectOptions = projectsQuery.data?.data ?? [];

  const teamEmployeesQuery = useQuery({
    queryKey: ["employees", "for-timesheets", teamProjectId],
    // Employee is pickable on its own — a project narrows the list when one
    // is chosen, but isn't required to browse or select a team member.
    queryFn: () =>
      api.get<EmployeesListResponse>(
        `/employees?pageSize=200${hasTeamProject ? `&projectId=${teamProjectId}` : ""}`,
      ),
    enabled: isTeamView,
  });
  const teamEmployeeOptions = teamEmployeesQuery.data?.data ?? [];

  function employeeName(employeeId: string): string {
    return teamEmployeeOptions.find((employee) => employee.id === employeeId)?.fullName ?? "Unknown employee";
  }

  const entriesQuery = useQuery({
    queryKey: [
      "timesheets",
      isTeamView ? "team" : "me",
      isTeamView ? teamProjectId : user?.id,
      isTeamView ? teamEmployeeId : null,
      dateFrom,
      dateTo,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (isTeamView) {
        // Project and employee each narrow independently — neither is
        // required for the other to work.
        if (hasTeamProject) params.set("projectId", teamProjectId);
        if (hasTeamEmployee) params.set("employeeId", teamEmployeeId);
      } else if (user?.id) {
        params.set("employeeId", user.id);
      }
      return api.get<TimesheetEntry[]>(`/timesheets?${params.toString()}`);
    },
    enabled: isTeamView ? hasTeamProject || hasTeamEmployee : !!user?.id,
  });

  const entries = entriesQuery.data ?? [];
  const totalHours = useMemo(() => entries.reduce((sum, entry) => sum + entry.hours, 0), [entries]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["timesheets"] });

  const createMutation = useMutation({
    mutationFn: (values: CreateTimesheetEntryInput) => api.post<TimesheetEntry>("/timesheets", values),
    onSuccess: () => {
      toast.success("Timesheet entry added.");
      invalidate();
      setDialogOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to add timesheet entry.")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Pick<CreateTimesheetEntryInput, "date" | "hours" | "notes"> }) =>
      api.patch<TimesheetEntry>(`/timesheets/${id}`, values),
    onSuccess: () => {
      toast.success("Timesheet entry updated.");
      invalidate();
      setDialogOpen(false);
      setEditingEntry(null);
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to update timesheet entry.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/timesheets/${id}`),
    onSuccess: () => {
      toast.success("Timesheet entry deleted.");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to delete timesheet entry.")),
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => api.post<TimesheetEntry>(`/timesheets/${id}/submit-for-approval`),
    onSuccess: () => {
      toast.success("Timesheet entry submitted for approval.");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to submit timesheet entry.")),
  });

  const isMutating = createMutation.isPending || updateMutation.isPending;

  function openAddDialog() {
    setEditingEntry(null);
    form.reset(emptyFormValues());
    setDialogOpen(true);
  }

  function openEditDialog(entry: TimesheetEntry) {
    setEditingEntry(entry);
    form.reset({
      date: format(parseISO(entry.date), DATE_FORMAT),
      hours: entry.hours,
      projectId: entry.projectId ?? undefined,
      taskId: entry.taskId ?? undefined,
      notes: entry.notes ?? undefined,
    });
    setDialogOpen(true);
  }

  function handleDelete(entry: TimesheetEntry) {
    if (window.confirm(`Delete the ${entry.hours}h entry on ${format(parseISO(entry.date), "MMM d, yyyy")}?`)) {
      deleteMutation.mutate(entry.id);
    }
  }

  function onSubmit(values: CreateTimesheetEntryInput) {
    if (editingEntry) {
      updateMutation.mutate({
        id: editingEntry.id,
        values: { date: values.date, hours: values.hours, notes: values.notes },
      });
      return;
    }
    createMutation.mutate(values);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{isTeamView ? "Team Timesheets" : "My Timesheet"}</h1>
          <p className="text-sm text-muted-foreground">
            {isTeamView
              ? "Review hours logged by the team. Filter by project, by employee, or both."
              : "Log and track your hours by project and task."}
          </p>
        </div>
        {!isTeamView && (
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4" />
            Add Entry
          </Button>
        )}
      </div>

      {canViewTeam && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={viewScope === "me" ? "default" : "ghost"}
              onClick={() => setViewScope("me")}
            >
              My Timesheet
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewScope === "team" ? "default" : "ghost"}
              onClick={() => setViewScope("team")}
            >
              Team Timesheets
            </Button>
          </div>

          {isTeamView && (
            <>
              <div className="w-full max-w-xs">
                <SearchableProjectDropdown
                  options={projectOptions.map((project) => ({ id: project.id, name: project.name, count: 0 }))}
                  activeId={teamProjectId}
                  onSelect={(id) => {
                    setTeamProjectId(id);
                    // Only reset the employee pick when narrowing to an
                    // actual project — the selected person might not be on
                    // it. Clearing back to "every project" never invalidates
                    // an employee pick, so leave it alone.
                    if (id !== NO_PROJECT_SELECTED) setTeamEmployeeId(ALL_EMPLOYEES);
                  }}
                  totalCount={0}
                  unitLabel="entry"
                  isLoading={projectsQuery.isLoading}
                  placeholder="Select a project…"
                  showCount={false}
                />
              </div>
              <Select value={teamEmployeeId} onValueChange={setTeamEmployeeId} disabled={teamEmployeesQuery.isLoading}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Any employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_EMPLOYEES}>Any employee</SelectItem>
                  {teamEmployeeOptions.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      )}

      {isTeamView && !hasTeamProject && !hasTeamEmployee ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Select a project or an employee above to view their timesheets.
          </CardContent>
        </Card>
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => setWeekStart((current) => addWeeks(current, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[11rem] text-center text-sm font-medium">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => setWeekStart((current) => addWeeks(current, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            This week
          </Button>
        </div>

        <Card>
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total hours this week</p>
              <p className="text-lg font-semibold">{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(2)}h</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {entriesQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : entriesQuery.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            {errorMessage(entriesQuery.error, "Failed to load timesheet entries.")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
          {weekDays.map((day) => {
            const dayEntries = entries
              .filter((entry) => isSameDay(parseISO(entry.date), day))
              .sort((a, b) => a.date.localeCompare(b.date));
            const dayTotal = dayEntries.reduce((sum, entry) => sum + entry.hours, 0);
            const isToday = isSameDay(day, new Date());

            return (
              <Card key={day.toISOString()} className={cn("flex flex-col", isToday && "border-primary")}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{format(day, "EEEE")}</CardTitle>
                  <p className="text-xs text-muted-foreground">{format(day, "MMM d")}</p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2 pt-0">
                  {dayEntries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No entries</p>
                  ) : (
                    dayEntries.map((entry) => (
                      <div key={entry.id} className="flex flex-col gap-1.5 rounded-md border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{entry.hours}h</span>
                          <Badge variant={statusVariant[entry.status]} className="text-[10px]">
                            {statusLabel[entry.status]}
                          </Badge>
                        </div>
                        {isTeamView && (
                          <span className="truncate font-medium">{employeeName(entry.employeeId)}</span>
                        )}
                        {(entry.projectId || entry.taskId) && (
                          <div className="flex flex-col gap-0.5 text-muted-foreground">
                            {entry.projectId && (
                              <span className="truncate" title={entry.projectName ?? entry.projectId}>
                                Project: {entry.projectName ?? "Unknown project"}
                              </span>
                            )}
                            {entry.taskId && (
                              <button
                                type="button"
                                className="truncate text-left text-primary hover:underline"
                                title="View task details"
                                onClick={() => setSelectedTaskId(entry.taskId ?? null)}
                              >
                                Task: {entry.taskTitle ?? "Unknown task"}
                              </button>
                            )}
                          </div>
                        )}
                        {entry.notes && <p className="text-muted-foreground">{entry.notes}</p>}
                        {!isTeamView && entry.status === TimesheetStatus.SUBMITTED && (
                          <div className="mt-1 flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Edit"
                              aria-label="Edit entry"
                              onClick={() => openEditDialog(entry)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              title="Delete"
                              aria-label="Delete entry"
                              disabled={deleteMutation.isPending}
                              onClick={() => handleDelete(entry)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Submit for approval"
                              aria-label="Submit for approval"
                              disabled={submitMutation.isPending}
                              onClick={() => submitMutation.mutate(entry.id)}
                            >
                              {submitMutation.isPending && submitMutation.variables === entry.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Send className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {dayTotal > 0 && (
                    <p className="mt-auto pt-1 text-xs font-medium text-muted-foreground">
                      {dayTotal % 1 === 0 ? dayTotal : dayTotal.toFixed(2)}h total
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
        </>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingEntry(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit Timesheet Entry" : "Add Timesheet Entry"}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? "Update the date, hours, or notes for this entry."
                : "Log hours against a project or task for a given date."}
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" {...form.register("date")} />
              {form.formState.errors.date && (
                <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hours">Hours</Label>
              <Input
                id="hours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                {...form.register("hours", { valueAsNumber: true })}
              />
              {form.formState.errors.hours && (
                <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="projectId">Project ID (optional)</Label>
              <Input
                id="projectId"
                placeholder="00000000-0000-0000-0000-000000000000"
                disabled={!!editingEntry}
                {...form.register("projectId", { setValueAs: (v) => (v === "" ? undefined : v) })}
              />
              {form.formState.errors.projectId && (
                <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taskId">Task ID (optional)</Label>
              <Input
                id="taskId"
                placeholder="00000000-0000-0000-0000-000000000000"
                disabled={!!editingEntry}
                {...form.register("taskId", { setValueAs: (v) => (v === "" ? undefined : v) })}
              />
              {form.formState.errors.taskId && (
                <p className="text-xs text-destructive">{form.formState.errors.taskId.message}</p>
              )}
              {editingEntry && (
                <p className="text-xs text-muted-foreground">
                  Project and task cannot be changed after an entry is created.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                {...form.register("notes", { setValueAs: (v) => (v === "" ? undefined : v) })}
              />
              {form.formState.errors.notes && (
                <p className="text-xs text-destructive">{form.formState.errors.notes.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isMutating}>
                {isMutating ? "Saving…" : editingEntry ? "Save Changes" : "Add Entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {selectedTaskId && <TaskDetailPanel taskId={selectedTaskId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
