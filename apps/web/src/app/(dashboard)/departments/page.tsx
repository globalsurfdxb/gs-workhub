"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Building2, Pencil, Plus, ShieldAlert, Users2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  createDepartmentSchema,
  isSuperAdminLevel,
  SystemRole,
  type CreateDepartmentInput,
  type Department,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import { useModuleAccess } from "@/lib/role-permissions";
import { useAuthStore } from "@/store/auth-store";

interface DepartmentManagerSummary {
  id: string;
  fullName: string;
  email: string;
  designation?: string | null;
}

interface DepartmentListItem extends Department {
  manager: DepartmentManagerSummary | null;
  head: DepartmentManagerSummary | null;
  teamCount: number;
  employeeCount: number;
}

interface EmployeeOption {
  id: string;
  fullName: string;
  email: string;
}

const NO_MANAGER_VALUE = "__none__";
const NO_HEAD_VALUE = "__none__";

type DialogState = { mode: "create" } | { mode: "edit"; department: DepartmentListItem } | null;

function DepartmentFormDialog({
  state,
  onOpenChange,
}: {
  state: DialogState;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const editingDepartment = state?.mode === "edit" ? state.department : null;
  const isEdit = editingDepartment !== null;
  const [managerId, setManagerId] = useState<string>(editingDepartment?.managerId ?? NO_MANAGER_VALUE);
  const [headId, setHeadId] = useState<string>(editingDepartment?.headId ?? NO_HEAD_VALUE);

  const employeesQuery = useQuery({
    queryKey: ["employees", "all-for-manager-picker"],
    queryFn: () => api.get<{ data: EmployeeOption[] }>("/employees?pageSize=200"),
    enabled: state !== null,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateDepartmentInput>({
    resolver: zodResolver(createDepartmentSchema),
    defaultValues: editingDepartment
      ? {
          name: editingDepartment.name,
          code: editingDepartment.code,
          description: editingDepartment.description ?? "",
        }
      : { name: "", code: "", description: "" },
  });

  useEffect(() => {
    if (editingDepartment) {
      reset({
        name: editingDepartment.name,
        code: editingDepartment.code,
        description: editingDepartment.description ?? "",
      });
      setManagerId(editingDepartment.managerId ?? NO_MANAGER_VALUE);
      setHeadId(editingDepartment.headId ?? NO_HEAD_VALUE);
    } else if (state?.mode === "create") {
      reset({ name: "", code: "", description: "" });
      setManagerId(NO_MANAGER_VALUE);
      setHeadId(NO_HEAD_VALUE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, reset]);

  const mutation = useMutation({
    mutationFn: (values: CreateDepartmentInput) => {
      const resolvedManagerId = managerId === NO_MANAGER_VALUE ? null : managerId;
      const resolvedHeadId = headId === NO_HEAD_VALUE ? null : headId;
      if (editingDepartment) {
        return api.patch(`/departments/${editingDepartment.id}`, {
          name: values.name,
          description: values.description || undefined,
          managerId: resolvedManagerId,
          headId: resolvedHeadId,
        });
      }
      return api.post("/departments", {
        name: values.name,
        code: values.code,
        description: values.description || undefined,
        managerId: resolvedManagerId,
        headId: resolvedHeadId,
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Department updated." : "Department created.");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
      );
    },
  });

  const employeeOptions = employeesQuery.data?.data ?? [];

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit department" : "Create department"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the department's details below."
              : "Add a new department to the organization directory."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="e.g. Creative Studio" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" placeholder="e.g. CRTV" disabled={isEdit} {...register("code")} />
            {isEdit ? (
              <p className="text-xs text-muted-foreground">Department code cannot be changed after creation.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Uppercase letters, numbers, - or _ only.</p>
            )}
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What does this department do?"
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="managerId">Department Manager</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger id="managerId">
                <SelectValue placeholder="No manager assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MANAGER_VALUE}>No manager assigned</SelectItem>
                {employeeOptions.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Grants this employee the Department Manager role, giving them access to department and
              employee administration.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="headId">Department Head</Label>
            <Select value={headId} onValueChange={setHeadId}>
              <SelectTrigger id="headId">
                <SelectValue placeholder="No head assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_HEAD_VALUE}>No head assigned</SelectItem>
                {employeeOptions.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Grants this employee the Department Head role — scoped to managing this department's
              employees, teams, and projects only.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function DepartmentsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const canViewDepartments = useModuleAccess(
    "departments",
    isSuperAdminLevel(user?.role) || user?.role === SystemRole.DEPARTMENT_MANAGER,
  );
  const isSuperAdmin = isSuperAdminLevel(user?.role);
  const [dialogState, setDialogState] = useState<DialogState>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["departments", isSuperAdmin ? "all" : "active"],
    queryFn: () =>
      api.get<DepartmentListItem[]>(isSuperAdmin ? "/departments?includeArchived=true" : "/departments"),
    enabled: canViewDepartments,
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      api.patch(`/departments/${id}/${archive ? "archive" : "unarchive"}`),
    onSuccess: (_data, variables) => {
      toast.success(variables.archive ? "Department archived." : "Department unarchived.");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Unable to update department status.");
    },
  });

  if (!canViewDepartments) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <CardTitle className="text-base">Access denied</CardTitle>
          <p className="text-sm text-muted-foreground">
            Only Super Admins and Department Managers can view departments. Contact your administrator if
            you believe you should have access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Departments</h1>
          <p className="text-sm text-muted-foreground">Browse and manage departments across GlobalSurf.</p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setDialogState({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Create Department
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Unable to load departments. Please try again later.
          </CardContent>
        </Card>
      ) : data && data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((department) => (
            <Card
              key={department.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/departments/${department.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter") router.push(`/departments/${department.id}`);
              }}
              className="flex h-full cursor-pointer flex-col transition-colors hover:border-primary/50 hover:shadow-md"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{department.name}</CardTitle>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {department.description || "No description provided."}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="outline">{department.code}</Badge>
                  {isSuperAdmin &&
                    (department.isArchived ? (
                      <Badge variant="muted">Archived</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    ))}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users2 className="h-4 w-4" />
                    {department.teamCount} {department.teamCount === 1 ? "team" : "teams"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" />
                    {department.employeeCount} {department.employeeCount === 1 ? "employee" : "employees"}
                  </span>
                </div>
                {department.manager && (
                  <p className="text-xs text-muted-foreground">Manager: {department.manager.fullName}</p>
                )}
                {department.head && (
                  <p className="text-xs text-muted-foreground">Head: {department.head.fullName}</p>
                )}
                {isSuperAdmin && (
                  <div className="mt-auto flex justify-end gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDialogState({ mode: "edit", department });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={archiveMutation.isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        archiveMutation.mutate({ id: department.id, archive: !department.isArchived });
                      }}
                    >
                      {department.isArchived ? (
                        <>
                          <ArchiveRestore className="h-4 w-4" />
                          Unarchive
                        </>
                      ) : (
                        <>
                          <Archive className="h-4 w-4" />
                          Archive
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No departments found.</CardContent>
        </Card>
      )}

      <DepartmentFormDialog
        state={dialogState}
        onOpenChange={(open) => {
          if (!open) setDialogState(null);
        }}
      />
    </div>
  );
}
