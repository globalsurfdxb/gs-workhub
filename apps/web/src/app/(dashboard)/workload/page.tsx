"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Gauge, TrendingDown, Users } from "lucide-react";
import { isSuperAdminLevel, type Department, type WorkloadSummary } from "@/lib/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

interface DepartmentWorkload {
  departmentId: string;
  departmentName: string;
  totalCapacityHours: number;
  totalAllocatedHours: number;
  utilizationPct: number;
  employeeCount: number;
}

const ALL_DEPARTMENTS = "all";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function utilizationBarColor(status: WorkloadSummary["status"]) {
  switch (status) {
    case "OVERLOADED":
      return "bg-destructive";
    case "UNDERUTILIZED":
      return "bg-secondary";
    default:
      return "bg-success";
  }
}

function UtilizationBar({ pct, status }: { pct: number; status: WorkloadSummary["status"] }) {
  const width = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", utilizationBarColor(status))} style={{ width: `${width}%` }} />
    </div>
  );
}

function StatusBadge({ status }: { status: WorkloadSummary["status"] }) {
  if (status === "OVERLOADED") return <Badge variant="destructive">Overloaded</Badge>;
  if (status === "UNDERUTILIZED") return <Badge variant="muted">Underutilized</Badge>;
  return <Badge variant="success">Optimal</Badge>;
}

function EmployeeWorkloadList({ items }: { items: WorkloadSummary[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No data</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <div key={item.employeeId} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{item.employeeName}</span>
            <span className="text-muted-foreground">{Math.round(item.utilizationPct)}%</span>
          </div>
          <UtilizationBar pct={item.utilizationPct} status={item.status} />
        </div>
      ))}
    </div>
  );
}

export default function WorkloadPage() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = isSuperAdminLevel(user?.role);

  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(ALL_DEPARTMENTS);

  const effectiveDepartmentId = isSuperAdmin
    ? selectedDepartmentId === ALL_DEPARTMENTS
      ? undefined
      : selectedDepartmentId
    : user?.departmentId ?? undefined;

  const queryString = effectiveDepartmentId ? `?departmentId=${effectiveDepartmentId}` : "";

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
    enabled: isSuperAdmin,
  });

  const employeesQuery = useQuery({
    queryKey: ["workload", "employees", effectiveDepartmentId],
    queryFn: () => api.get<WorkloadSummary[]>(`/workload/employees${queryString}`),
    enabled: !!user,
  });

  const overloadedQuery = useQuery({
    queryKey: ["workload", "overloaded", effectiveDepartmentId],
    queryFn: () => api.get<WorkloadSummary[]>(`/workload/overloaded${queryString}`),
    enabled: !!user,
  });

  const underutilizedQuery = useQuery({
    queryKey: ["workload", "underutilized", effectiveDepartmentId],
    queryFn: () => api.get<WorkloadSummary[]>(`/workload/underutilized${queryString}`),
    enabled: !!user,
  });

  const departmentWorkloadQuery = useQuery({
    queryKey: ["workload", "department", effectiveDepartmentId],
    queryFn: () => api.get<DepartmentWorkload>(`/workload/departments/${effectiveDepartmentId}`),
    enabled: !!effectiveDepartmentId,
  });

  const employees = employeesQuery.data ?? [];
  const overloadedCount = employees.filter((e) => e.status === "OVERLOADED").length;
  const underutilizedCount = employees.filter((e) => e.status === "UNDERUTILIZED").length;
  const avgUtilization =
    employees.length > 0
      ? Math.round(employees.reduce((sum, e) => sum + e.utilizationPct, 0) / employees.length)
      : 0;

  const statsLoading = employeesQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Workload Management</h1>
          <p className="text-sm text-muted-foreground">
            Employee capacity and utilization across {isSuperAdmin ? "the organization" : "your department"}
          </p>
        </div>

        {isSuperAdmin && (
          <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DEPARTMENTS}>All departments</SelectItem>
              {departmentsQuery.data?.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {statsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Employees" value={employees.length} icon={Users} />
          <StatCard label="Overloaded" value={overloadedCount} icon={AlertTriangle} />
          <StatCard label="Underutilized" value={underutilizedCount} icon={TrendingDown} />
          <StatCard label="Avg. Utilization" value={`${avgUtilization}%`} icon={Gauge} />
        </div>
      )}

      {effectiveDepartmentId && (
        <Card>
          <CardHeader>
            <CardTitle>Department Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            {departmentWorkloadQuery.isLoading ? (
              <Skeleton className="h-16" />
            ) : departmentWorkloadQuery.data ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{departmentWorkloadQuery.data.departmentName}</span>
                  <span className="text-muted-foreground">
                    {departmentWorkloadQuery.data.totalAllocatedHours}h allocated of{" "}
                    {departmentWorkloadQuery.data.totalCapacityHours}h capacity ·{" "}
                    {departmentWorkloadQuery.data.employeeCount} employees
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(Math.max(departmentWorkloadQuery.data.utilizationPct, 0), 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-medium">
                    {Math.round(departmentWorkloadQuery.data.utilizationPct)}%
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Overloaded Employees</CardTitle>
          </CardHeader>
          <CardContent>
            {overloadedQuery.isLoading ? (
              <div className="flex flex-col gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : (
              <EmployeeWorkloadList items={overloadedQuery.data ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Underutilized Employees</CardTitle>
          </CardHeader>
          <CardContent>
            {underutilizedQuery.isLoading ? (
              <div className="flex flex-col gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : (
              <EmployeeWorkloadList items={underutilizedQuery.data ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Employees</CardTitle>
        </CardHeader>
        <CardContent>
          {employeesQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Capacity (h/week)</TableHead>
                  <TableHead>Allocated (h)</TableHead>
                  <TableHead>Utilization</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.employeeId}>
                    <TableCell className="font-medium">{employee.employeeName}</TableCell>
                    <TableCell>{employee.capacityHours}</TableCell>
                    <TableCell>{employee.allocatedHours}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-24">
                          <UtilizationBar pct={employee.utilizationPct} status={employee.status} />
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {Math.round(employee.utilizationPct)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={employee.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
