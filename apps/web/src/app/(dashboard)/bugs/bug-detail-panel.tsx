"use client";

import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Priority } from "@/lib/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  BUG_STATUS_LABELS,
  BUG_STATUS_ORDER,
  bugStatusBadgeVariant,
  initials,
  invalidateBugQueries,
  PRIORITY_FILTER_ORDER,
  PRIORITY_LABELS,
  priorityBadgeVariant,
  type BugRow,
  type BugStatus,
  type DevTeamDetail,
} from "@/lib/dev-shared";

/** Radix Select reserves the empty string, so "no assignee" needs a sentinel. */
const UNASSIGNED = "UNASSIGNED";

function longDate(value: string): string {
  return format(new Date(value), "d MMM yyyy, HH:mm");
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

/**
 * Fetches and renders the full detail view for a single bug. Meant to be
 * rendered inside a <Sheet><SheetContent>...</SheetContent></Sheet> by the
 * caller — this component only owns the content, not the slide-over shell.
 *
 * `teamId` is the Development team, used solely to populate the assignee
 * picker with the engineers who can actually pick the defect up.
 */
export function BugDetailPanel({ bugId, teamId }: { bugId: string; teamId: string }) {
  const queryClient = useQueryClient();

  const bugQuery = useQuery({
    queryKey: ["dev-bugs", "detail", bugId],
    queryFn: () => api.get<BugRow>(`/bugs/${bugId}`),
  });

  // The Development team's roster — the pool of possible assignees.
  const teamQuery = useQuery({
    queryKey: ["teams", "detail", teamId],
    queryFn: () => api.get<DevTeamDetail>(`/teams/${teamId}`),
    enabled: !!teamId,
    staleTime: 5 * 60_000,
  });
  const members = teamQuery.data?.members ?? [];

  const invalidate = () => {
    invalidateBugQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ["dev-bugs", "detail", bugId] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: BugStatus) => api.patch<BugRow>(`/bugs/${bugId}`, { status }),
    onSuccess: () => {
      invalidate();
      toast.success("Bug status updated.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to update status."),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: Priority) => api.patch<BugRow>(`/bugs/${bugId}`, { priority }),
    onSuccess: () => {
      invalidate();
      toast.success("Severity updated.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to update severity."),
  });

  const assigneeMutation = useMutation({
    mutationFn: (assigneeId: string | null) =>
      api.patch<BugRow>(`/bugs/${bugId}`, { assigneeId }),
    onSuccess: () => {
      invalidate();
      toast.success("Assignee updated.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Failed to update assignee."),
  });

  if (bugQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (bugQuery.isError || !bugQuery.data) {
    return <p className="text-sm text-destructive">Unable to load this bug.</p>;
  }

  const bug = bugQuery.data;

  // A defect can already be assigned to someone outside the Development roster
  // (a QA engineer verifying a fix, say), so keep the current assignee in the
  // option list rather than letting the trigger render blank.
  const assigneeOptions: { id: string; fullName: string }[] = members.map((member) => ({
    id: member.userId,
    fullName: member.fullName,
  }));
  if (bug.assignee && !assigneeOptions.some((option) => option.id === bug.assignee?.id)) {
    assigneeOptions.unshift({ id: bug.assignee.id, fullName: bug.assignee.fullName });
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto pb-4 pr-1">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={bugStatusBadgeVariant(bug.status)}>{BUG_STATUS_LABELS[bug.status]}</Badge>
          <Badge variant={priorityBadgeVariant(bug.priority)}>
            {PRIORITY_LABELS[bug.priority]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {bug.project?.name ?? bug.projectId}
          </span>
        </div>
        <SheetTitle className="text-xl">{bug.title}</SheetTitle>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {bug.description || "No description provided."}
        </p>
        {bug.screenshotUrl && (
          <a href={bug.screenshotUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- runtime data: URL, not a static asset */}
            <img
              src={bug.screenshotUrl}
              alt="Bug screenshot"
              className="max-h-64 w-full rounded-md border object-contain"
            />
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select
            value={bug.status}
            onValueChange={(value) => statusMutation.mutate(value as BugStatus)}
            disabled={statusMutation.isPending}
          >
            <SelectTrigger>
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Severity</Label>
          <Select
            value={bug.priority}
            onValueChange={(value) => priorityMutation.mutate(value as Priority)}
            disabled={priorityMutation.isPending}
          >
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
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Assignee</Label>
        <Select
          value={bug.assignee?.id ?? UNASSIGNED}
          onValueChange={(value) =>
            assigneeMutation.mutate(value === UNASSIGNED ? null : value)
          }
          disabled={assigneeMutation.isPending || teamQuery.isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {assigneeOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {bug.assignee && (
          <div className="mt-1 flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback>{initials(bug.assignee.fullName)}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{bug.assignee.fullName}</span>
          </div>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <FieldRow label="Project">{bug.project?.name ?? bug.projectId}</FieldRow>
        <FieldRow label="Reported by">{bug.reporter?.fullName ?? "—"}</FieldRow>
        <FieldRow label="Created">{longDate(bug.createdAt)}</FieldRow>
        <FieldRow label="Resolved">
          {bug.resolvedAt ? longDate(bug.resolvedAt) : "Not resolved yet"}
        </FieldRow>
        <FieldRow label="Linked task">{bug.taskId ?? "None"}</FieldRow>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <Label>Status History</Label>
        <ol className="flex flex-col gap-3">
          {bug.statusHistory.map((entry, index) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <div className="flex flex-col items-center pt-0.5">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    index === bug.statusHistory.length - 1 ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
                {index < bug.statusHistory.length - 1 && (
                  <span className="mt-0.5 w-px flex-1 bg-border" aria-hidden="true" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-0.5 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={bugStatusBadgeVariant(entry.status)}>
                    {BUG_STATUS_LABELS[entry.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{longDate(entry.changedAt)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {entry.changedBy?.fullName ?? "Unknown"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
