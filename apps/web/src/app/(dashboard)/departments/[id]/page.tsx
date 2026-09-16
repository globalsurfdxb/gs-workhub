"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Briefcase, Building2, Mail, ShieldAlert, Users2 } from "lucide-react";
import { toast } from "sonner";
import { isSuperAdminLevel, type Department, type Team } from "@/lib/shared";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";

interface DepartmentManager {
  id: string;
  fullName: string;
  email: string;
  designation?: string | null;
  avatarUrl?: string | null;
}

interface DepartmentDetail extends Department {
  teams: Team[];
  manager: DepartmentManager | null;
  head: DepartmentManager | null;
  dashboard: {
    activeProjectCount: number;
    employeeCount: number;
    teamCount: number;
  };
}

interface ResourceAllocation {
  totalTeams: number;
  totalEmployees: number;
  totalWeeklyCapacityHours: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Briefcase;
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

function AllocationStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = isSuperAdminLevel(user?.role);
  const canViewDepartments = isSuperAdmin || user?.role === "DEPARTMENT_MANAGER";
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["departments", id],
    queryFn: () => api.get<DepartmentDetail>(`/departments/${id}`),
    enabled: !!id && canViewDepartments,
  });

  const allocationQuery = useQuery({
    queryKey: ["departments", id, "resource-allocation"],
    queryFn: () => api.get<ResourceAllocation>(`/departments/${id}/resource-allocation`),
    enabled: !!id && canViewDepartments,
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.patch(`/departments/${id}/archive`),
    onSuccess: () => {
      toast.success("Department archived.");
      setArchiveDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Unable to archive department.");
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

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-28" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/departments"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to departments
        </Link>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Unable to load this department. It may not exist, or you may not have access to it.
          </CardContent>
        </Card>
      </div>
    );
  }

  const department = detailQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/departments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to departments
      </Link>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{department.name}</h1>
              <Badge variant="outline">{department.code}</Badge>
              {department.isArchived && <Badge variant="muted">Archived</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {department.description || "No description provided."}
            </p>
            {department.manager ? (
              <div className="mt-1 flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">Manager:</span>
                <span className="font-medium">{department.manager.fullName}</span>
                <a
                  href={`mailto:${department.manager.email}`}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Email ${department.manager.fullName}`}
                >
                  <Mail className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No manager assigned.</p>
            )}
            {department.head ? (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">Head:</span>
                <span className="font-medium">{department.head.fullName}</span>
                <a
                  href={`mailto:${department.head.email}`}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Email ${department.head.fullName}`}
                >
                  <Mail className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No department head assigned.</p>
            )}
          </div>

          {isSuperAdmin && !department.isArchived && (
            <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Archive className="h-4 w-4" /> Archive department
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Archive {department.name}?</DialogTitle>
                  <DialogDescription>
                    This department will be hidden from active directories and reporting until it is
                    unarchived. Existing teams and employees remain assigned to it.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setArchiveDialogOpen(false)}
                    disabled={archiveMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => archiveMutation.mutate()}
                    disabled={archiveMutation.isPending}
                  >
                    {archiveMutation.isPending ? "Archiving…" : "Archive"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active Projects" value={department.dashboard.activeProjectCount} icon={Briefcase} />
        <StatCard label="Employees" value={department.dashboard.employeeCount} icon={Users2} />
        <StatCard label="Teams" value={department.dashboard.teamCount} icon={Building2} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resource allocation</CardTitle>
            </CardHeader>
            <CardContent>
              {allocationQuery.isLoading ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : allocationQuery.data ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <AllocationStat label="Teams" value={allocationQuery.data.totalTeams} />
                  <AllocationStat label="Employees" value={allocationQuery.data.totalEmployees} />
                  <AllocationStat
                    label="Weekly capacity (hrs)"
                    value={allocationQuery.data.totalWeeklyCapacityHours}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Resource allocation data unavailable.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Teams in this department</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/teams">Manage teams</Link>
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {department.teams.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No teams have been created for this department yet.
                </p>
              ) : (
                department.teams.map((team) => (
                  <div
                    key={team.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{team.name}</span>
                      <Badge variant="outline">{team.code}</Badge>
                      {team.isArchived && <Badge variant="muted">Archived</Badge>}
                    </div>
                    <span className="text-muted-foreground">
                      {team.capacityHoursPerWeek} hrs/week capacity
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
