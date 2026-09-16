"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { EmployeeAvailability, isSuperAdminLevel, SystemRole, type Department } from "@/lib/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
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
import { api, ApiError } from "@/lib/api-client";
import { useModuleAccess } from "@/lib/role-permissions";
import { useAuthStore } from "@/store/auth-store";
import { EMPLOYEE_AVAILABILITY_LABELS, availabilityBadgeVariant, initials } from "./shared";

const ROLE_LABEL: Record<SystemRole, string> = {
  [SystemRole.SUPER_ADMIN]: "Super Admin",
  [SystemRole.MANAGER]: "Manager",
  [SystemRole.GENERAL_MANAGER]: "General Manager",
  [SystemRole.DEPARTMENT_MANAGER]: "Department Manager",
  [SystemRole.DEPARTMENT_HEAD]: "Department Head",
  [SystemRole.TEAM_LEAD]: "Team Lead",
  [SystemRole.EMPLOYEE]: "Employee",
  [SystemRole.CLIENT]: "Client",
};

const NO_DEPARTMENT = "__none__";

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  role: z.nativeEnum(SystemRole),
  departmentId: z.string(),
  designation: z.string().trim().max(200).optional(),
  capacityHoursPerWeek: z.coerce.number().min(0).max(500).optional(),
});
type CreateEmployeeFormValues = z.infer<typeof createEmployeeSchema>;

interface EmployeeListItem {
  id: string;
  fullName: string;
  email: string;
  designation?: string | null;
  availability: EmployeeAvailability;
  capacityHoursPerWeek: number;
  avatarUrl?: string | null;
  departmentId?: string | null;
}

interface EmployeesResponse {
  data: EmployeeListItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 12;

export default function EmployeesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isDepartmentHead = currentUser?.role === SystemRole.DEPARTMENT_HEAD;
  const staticEmployeesAccess =
    isSuperAdminLevel(currentUser?.role) ||
    currentUser?.role === SystemRole.DEPARTMENT_MANAGER ||
    isDepartmentHead;
  const canViewEmployees = useModuleAccess("employees", staticEmployeesAccess);
  const canCreate = canViewEmployees;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [departmentId, setDepartmentId] = useState(() =>
    isDepartmentHead ? currentUser?.departmentId ?? "all" : "all",
  );
  const [availability, setAvailability] = useState("all");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const createForm = useForm<CreateEmployeeFormValues>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      role: SystemRole.EMPLOYEE,
      departmentId: isDepartmentHead ? currentUser?.departmentId ?? NO_DEPARTMENT : NO_DEPARTMENT,
      designation: "",
      capacityHoursPerWeek: 40,
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateEmployeeFormValues) =>
      api.post("/employees", {
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        role: values.role,
        designation: values.designation?.trim() ? values.designation.trim() : undefined,
        departmentId: values.departmentId === NO_DEPARTMENT ? undefined : values.departmentId,
        capacityHoursPerWeek: values.capacityHoursPerWeek,
      }),
    onSuccess: () => {
      toast.success("Employee created.");
      setIsCreateOpen(false);
      createForm.reset({
        fullName: "",
        email: "",
        password: "",
        role: SystemRole.EMPLOYEE,
        departmentId: isDepartmentHead ? currentUser?.departmentId ?? NO_DEPARTMENT : NO_DEPARTMENT,
        designation: "",
        capacityHoursPerWeek: 40,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to create employee.");
    },
  });

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, departmentId, availability]);

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
    enabled: canViewEmployees,
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (departmentId !== "all") params.set("departmentId", departmentId);
    if (availability !== "all") params.set("availability", availability);
    return params.toString();
  }, [page, debouncedSearch, departmentId, availability]);

  const employeesQuery = useQuery({
    queryKey: ["employees", queryString],
    queryFn: () => api.get<EmployeesResponse>(`/employees?${queryString}`),
    enabled: canViewEmployees,
  });

  const departmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    departmentsQuery.data?.forEach((dept) => map.set(dept.id, dept.name));
    return map;
  }, [departmentsQuery.data]);

  const employees = employeesQuery.data?.data ?? [];
  const meta = employeesQuery.data?.meta;

  if (!canViewEmployees) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <CardTitle className="text-base">Access denied</CardTitle>
          <p className="text-sm text-muted-foreground">
            Only Super Admins and Department Managers can view employee data. Contact your administrator if
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
          <h1 className="text-2xl font-semibold">Employee Directory</h1>
          <p className="text-sm text-muted-foreground">Browse and search employees across the organization.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Employee
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email…"
              className="pl-9"
            />
          </div>
          <Select value={departmentId} onValueChange={setDepartmentId} disabled={isDepartmentHead}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              {!isDepartmentHead && <SelectItem value="all">All Departments</SelectItem>}
              {departmentsQuery.data?.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={availability} onValueChange={setAvailability}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Availability</SelectItem>
              {Object.values(EmployeeAvailability).map((value) => (
                <SelectItem key={value} value={value}>
                  {EMPLOYEE_AVAILABILITY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {employeesQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : employeesQuery.isError ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-destructive">
            Failed to load employees. Please try again.
          </CardContent>
        </Card>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No employees match your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {employees.map((employee) => {
            return (
              <Card
                key={employee.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/employees/${employee.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") router.push(`/employees/${employee.id}`);
                }}
                className="cursor-pointer transition-shadow hover:shadow-md"
              >
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11">
                      {employee.avatarUrl ? <AvatarImage src={employee.avatarUrl} alt={employee.fullName} /> : null}
                      <AvatarFallback>{initials(employee.fullName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{employee.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {employee.designation ?? "No designation"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {employee.departmentId ? departmentNameById.get(employee.departmentId) ?? "—" : "Unassigned"}
                    </span>
                    <Badge variant={availabilityBadgeVariant(employee.availability)}>
                      {EMPLOYEE_AVAILABILITY_LABELS[employee.availability]}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>Create a new account. They can sign in with this email and password.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" placeholder="e.g. Amina Hassan" {...createForm.register("fullName")} />
              {createForm.formState.errors.fullName && (
                <p className="text-xs text-destructive">{createForm.formState.errors.fullName.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="amina.hassan@globalsurf.ae" {...createForm.register("email")} />
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Temporary password</Label>
              <Input id="password" type="password" placeholder="At least 8 characters" {...createForm.register("password")} />
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role">Role</Label>
                <Controller
                  control={createForm.control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(isDepartmentHead
                          ? [SystemRole.TEAM_LEAD, SystemRole.EMPLOYEE, SystemRole.CLIENT]
                          : Object.values(SystemRole)
                        ).map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="createDepartmentId">Department</Label>
                <Controller
                  control={createForm.control}
                  name="departmentId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isDepartmentHead}>
                      <SelectTrigger id="createDepartmentId">
                        <SelectValue placeholder="No department" />
                      </SelectTrigger>
                      <SelectContent>
                        {!isDepartmentHead && <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>}
                        {departmentsQuery.data?.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="designation">Designation (optional)</Label>
                <Input id="designation" placeholder="e.g. Software Engineer" {...createForm.register("designation")} />
                <p className="text-xs text-muted-foreground">Leave blank to use the selected role as the title.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capacityHoursPerWeek">Capacity (hours/week)</Label>
                <Input
                  id="capacityHoursPerWeek"
                  type="number"
                  min={0}
                  max={500}
                  step="1"
                  {...createForm.register("capacityHoursPerWeek")}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create employee"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
