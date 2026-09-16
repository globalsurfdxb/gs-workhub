"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ApprovalStatus, ApprovalType, SUPER_ADMIN_LEVEL_ROLES, SystemRole } from "@/lib/shared";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";

// ---- Types mirroring apps/api/src/modules/approvals (ApprovalsService APPROVAL_INCLUDE) ----

interface ApprovalUserSummary {
  id: string;
  fullName: string;
  email: string;
  role: SystemRole;
}

interface ApprovalProjectSummary {
  id: string;
  name: string;
}

interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  requesterId: string;
  approverId: string | null;
  entityLabel: string;
  projectId: string | null;
  comment: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  requester?: ApprovalUserSummary | null;
  approver?: ApprovalUserSummary | null;
  project?: ApprovalProjectSummary | null;
}

const REVIEWER_ROLES: SystemRole[] = [
  ...SUPER_ADMIN_LEVEL_ROLES,
  SystemRole.DEPARTMENT_MANAGER,
  SystemRole.TEAM_LEAD,
];

// TIMESHEET approvals are created automatically by the API and cannot be requested here.
const REQUESTABLE_TYPES = [
  ApprovalType.LEAVE,
  ApprovalType.TASK,
  ApprovalType.CONTENT,
  ApprovalType.DESIGN,
  ApprovalType.PROJECT,
] as const;

const STATUS_BADGE_VARIANT: Record<ApprovalStatus, "muted" | "warning" | "success" | "destructive"> = {
  [ApprovalStatus.DRAFT]: "muted",
  [ApprovalStatus.SUBMITTED]: "warning",
  [ApprovalStatus.PENDING]: "warning",
  [ApprovalStatus.APPROVED]: "success",
  [ApprovalStatus.REJECTED]: "destructive",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(new Date(value), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANT[status]}>{status}</Badge>;
}

function TypeBadge({ type }: { type: ApprovalType }) {
  return <Badge variant="outline">{type}</Badge>;
}

// ---- New request dialog ("My Requests" tab) ----

const createRequestSchema = z
  .object({
    type: z.enum(["LEAVE", "TASK", "CONTENT", "DESIGN", "PROJECT"]),
    entityLabel: z.string().trim().min(1, "Entity label is required"),
    projectId: z.string().trim().optional(),
    comment: z.string().trim().optional(),
  })
  .refine((data) => data.type !== "PROJECT" || !!data.projectId, {
    message: "Project ID is required for PROJECT approvals",
    path: ["projectId"],
  });

type CreateRequestInput = z.infer<typeof createRequestSchema>;

function NewRequestDialog({ requesterId }: { requesterId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateRequestInput>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: { type: "LEAVE", entityLabel: "", projectId: "", comment: "" },
  });

  const selectedType = watch("type");

  const mutation = useMutation({
    mutationFn: (values: CreateRequestInput) =>
      api.post<ApprovalRequest>("/approvals", {
        type: values.type,
        entityLabel: values.entityLabel,
        projectId: values.type === "PROJECT" ? values.projectId : undefined,
        comment: values.comment ? values.comment : undefined,
      }),
    onSuccess: () => {
      toast.success("Approval request submitted.");
      queryClient.invalidateQueries({ queryKey: ["approvals", "mine", requesterId] });
      queryClient.invalidateQueries({ queryKey: ["approvals", "pending"] });
      reset({ type: "LEAVE", entityLabel: "", projectId: "", comment: "" });
      setOpen(false);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to submit request.");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset({ type: "LEAVE", entityLabel: "", projectId: "", comment: "" });
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New Request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Approval Request</DialogTitle>
          <DialogDescription>Submit a request for approval.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Type</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUESTABLE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entityLabel">Entity Label</Label>
            <Input
              id="entityLabel"
              placeholder="e.g. Annual leave — Aug 20-24"
              {...register("entityLabel")}
            />
            {errors.entityLabel && <p className="text-xs text-destructive">{errors.entityLabel.message}</p>}
          </div>

          {selectedType === "PROJECT" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="projectId">Project ID</Label>
              <Input id="projectId" placeholder="Project UUID" {...register("projectId")} />
              {errors.projectId && <p className="text-xs text-destructive">{errors.projectId.message}</p>}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comment">Comment</Label>
            <Textarea id="comment" placeholder="Optional context for the approver" {...register("comment")} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- My Requests tab ----

function MyRequestsTab({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ["approvals", "mine", userId],
    queryFn: () => api.get<ApprovalRequest[]>(`/approvals?requesterId=${userId}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>My Requests</CardTitle>
        <NewRequestDialog requesterId={userId} />
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : query.data && query.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Decided</TableHead>
                <TableHead>Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((approval) => (
                <TableRow key={approval.id}>
                  <TableCell>
                    <TypeBadge type={approval.type} />
                  </TableCell>
                  <TableCell className="font-medium">{approval.entityLabel}</TableCell>
                  <TableCell>
                    <StatusBadge status={approval.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(approval.submittedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(approval.decidedAt)}</TableCell>
                  <TableCell
                    className="max-w-[240px] truncate text-muted-foreground"
                    title={approval.comment ?? undefined}
                  >
                    {approval.comment || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You haven&apos;t submitted any approval requests yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Approve / Reject dialogs ("Pending My Review" tab) ----

const approveSchema = z.object({ comment: z.string().trim().optional() });
type ApproveInput = z.infer<typeof approveSchema>;

const rejectSchema = z.object({
  comment: z.string().trim().min(1, "A comment is required to reject a request."),
});
type RejectInput = z.infer<typeof rejectSchema>;

function ApproveDialog({ approval }: { approval: ApprovalRequest }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApproveInput>({ resolver: zodResolver(approveSchema), defaultValues: { comment: "" } });

  const mutation = useMutation({
    mutationFn: (values: ApproveInput) =>
      api.post(`/approvals/${approval.id}/approve`, { comment: values.comment ? values.comment : undefined }),
    onSuccess: () => {
      toast.success("Request approved.");
      queryClient.invalidateQueries({ queryKey: ["approvals", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["approvals", "mine", approval.requesterId] });
      reset({ comment: "" });
      setOpen(false);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to approve request.");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset({ comment: "" });
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Approve</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve Request</DialogTitle>
          <DialogDescription>{approval.entityLabel}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`approve-comment-${approval.id}`}>Comment (optional)</Label>
            <Textarea
              id={`approve-comment-${approval.id}`}
              placeholder="Add an optional note"
              {...register("comment")}
            />
            {errors.comment && <p className="text-xs text-destructive">{errors.comment.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Approving…" : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ approval }: { approval: ApprovalRequest }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RejectInput>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { comment: "" },
    mode: "onChange",
  });

  const commentValue = watch("comment");

  const mutation = useMutation({
    mutationFn: (values: RejectInput) => api.post(`/approvals/${approval.id}/reject`, { comment: values.comment }),
    onSuccess: () => {
      toast.success("Request rejected.");
      queryClient.invalidateQueries({ queryKey: ["approvals", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["approvals", "mine", approval.requesterId] });
      reset({ comment: "" });
      setOpen(false);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to reject request.");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset({ comment: "" });
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Request</DialogTitle>
          <DialogDescription>{approval.entityLabel}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reject-comment-${approval.id}`}>Comment (required)</Label>
            <Textarea
              id={`reject-comment-${approval.id}`}
              placeholder="Explain why this request is rejected"
              {...register("comment")}
            />
            {errors.comment && <p className="text-xs text-destructive">{errors.comment.message}</p>}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={mutation.isPending || !commentValue?.trim()}
            >
              {mutation.isPending ? "Rejecting…" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Pending My Review tab ----

function PendingReviewTab({ role }: { role: SystemRole | undefined }) {
  const canReview = !!role && REVIEWER_ROLES.includes(role);

  const query = useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: () => api.get<ApprovalRequest[]>("/approvals?pendingForMe=true"),
    enabled: canReview,
  });

  if (!canReview) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nothing to review.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending My Review</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : query.data && query.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requester</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((approval) => (
                <TableRow key={approval.id}>
                  <TableCell className="font-medium">{approval.requester?.fullName ?? "—"}</TableCell>
                  <TableCell>
                    <TypeBadge type={approval.type} />
                  </TableCell>
                  <TableCell>{approval.entityLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(approval.submittedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <ApproveDialog approval={approval} />
                      <RejectDialog approval={approval} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No approval requests are waiting for your review.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Page ----

export default function ApprovalsPage() {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground">Submit requests and review approvals awaiting your decision.</p>
      </div>

      <Tabs defaultValue="my-requests">
        <TabsList>
          <TabsTrigger value="my-requests">My Requests</TabsTrigger>
          <TabsTrigger value="pending-review">Pending My Review</TabsTrigger>
        </TabsList>
        <TabsContent value="my-requests">
          <MyRequestsTab userId={user.id} />
        </TabsContent>
        <TabsContent value="pending-review">
          <PendingReviewTab role={user.role} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
