"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Gauge,
  Settings,
  ShieldCheck,
  UsersRound,
  Users,
} from "lucide-react";
import { isSuperAdminLevel, ProjectStatus } from "@/lib/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useDevTeamAccess } from "@/lib/dev-shared";
import { useAuthStore } from "@/store/auth-store";
import {
  PROJECT_STATUS_LABELS,
  formatDate,
  healthScoreBadgeVariant,
  projectStatusBadgeVariant,
} from "../projects/_lib/project-ui";
import { DevelopmentTeamDashboard } from "./development-team-dashboard";

interface DepartmentPerformance {
  departmentId: string;
  name: string;
  completionRate: number;
  employeeCount: number;
  activeProjectCount: number;
  utilizationPct: number;
}

interface UpcomingDeadline {
  id: string;
  name: string;
  dueDate: string | null;
  status: ProjectStatus;
  healthScore: number;
}

interface WorkloadEntry {
  employeeId: string;
  employeeName: string;
  utilizationPct: number;
  status: "OVERLOADED" | "OPTIMAL" | "UNDERUTILIZED";
}

interface CompanyReport {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalEmployees: number;
  totalDepartments: number;
  totalTeams: number;
  overdueTasksCount: number;
  departmentPerformance: DepartmentPerformance[];
  projectsByStatus: Record<ProjectStatus, number>;
  upcomingDeadlines: UpcomingDeadline[];
  topWorkload: WorkloadEntry[];
  resourceUtilizationPct: number;
}

interface DepartmentReport {
  activeProjects: number;
  activeTasks: number;
  overdueTasks: number;
  teamProductivity: number;
  utilizationPct: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  tone?: "default" | "warning";
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-2xl font-semibold", tone === "warning" && value !== 0 && "text-destructive")}>
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            tone === "warning" ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

const PROJECT_STATUS_BAR_ORDER: ProjectStatus[] = [
  ProjectStatus.PLANNING,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.ON_HOLD,
  ProjectStatus.REVIEW,
  ProjectStatus.COMPLETED,
  ProjectStatus.CANCELLED,
];

function projectStatusBarColor(status: ProjectStatus): string {
  switch (status) {
    case ProjectStatus.PLANNING:
      return "bg-secondary-foreground/60";
    case ProjectStatus.IN_PROGRESS:
      return "bg-primary";
    case ProjectStatus.ON_HOLD:
      return "bg-warning";
    case ProjectStatus.REVIEW:
      return "bg-accent-foreground/60";
    case ProjectStatus.COMPLETED:
      return "bg-success";
    case ProjectStatus.CANCELLED:
      return "bg-destructive";
    default:
      return "bg-primary";
  }
}

function ProjectsByStatusCard({ counts, total }: { counts: Record<ProjectStatus, number>; total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Projects by Status</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          PROJECT_STATUS_BAR_ORDER.map((status) => {
            const count = counts[status] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={status} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{PROJECT_STATUS_LABELS[status]}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", projectStatusBarColor(status))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function DepartmentPerformanceCard({ departments }: { departments: DepartmentPerformance[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Department Performance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No departments yet.</p>
        ) : (
          departments.map((dept) => (
            <div key={dept.departmentId} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{dept.name}</span>
                <span className="text-muted-foreground">
                  {dept.employeeCount} {dept.employeeCount === 1 ? "employee" : "employees"} ·{" "}
                  {dept.activeProjectCount} active
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-success" style={{ width: `${dept.completionRate}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{Math.round(dept.completionRate)}% tasks complete</span>
                <span>{Math.round(dept.utilizationPct)}% utilized</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingDeadlinesCard({ deadlines }: { deadlines: UpcomingDeadline[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {deadlines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing due soon.</p>
        ) : (
          deadlines.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">Due {formatDate(project.dueDate)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={projectStatusBadgeVariant(project.status)}>
                  {PROJECT_STATUS_LABELS[project.status]}
                </Badge>
                <Badge variant={healthScoreBadgeVariant(project.healthScore)}>{project.healthScore}</Badge>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function workloadBarColor(status: WorkloadEntry["status"]): string {
  switch (status) {
    case "OVERLOADED":
      return "bg-destructive";
    case "UNDERUTILIZED":
      return "bg-secondary";
    default:
      return "bg-success";
  }
}

function TopWorkloadCard({ entries }: { entries: WorkloadEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Highest Workload</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workload data yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.employeeId} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{entry.employeeName}</span>
                <span className="text-muted-foreground">{Math.round(entry.utilizationPct)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", workloadBarColor(entry.status))}
                  style={{ width: `${Math.min(Math.max(entry.utilizationPct, 0), 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

const QUICK_LINKS = [
  { label: "Departments", href: "/departments", icon: Building2 },
  { label: "Employees", href: "/employees", icon: Users },
  { label: "Teams", href: "/admin/teams", icon: UsersRound },
  { label: "Roles & Permissions", href: "/admin/roles", icon: ShieldCheck },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

function QuickLinksCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isCompanyView = isSuperAdminLevel(user?.role);

  const companyQuery = useQuery({
    queryKey: ["reports", "company"],
    queryFn: () => api.get<CompanyReport>("/reports/company"),
    enabled: isCompanyView,
  });

  const departmentQuery = useQuery({
    queryKey: ["reports", "department", user?.departmentId],
    queryFn: () => api.get<DepartmentReport>(`/reports/departments/${user?.departmentId}`),
    enabled: !isCompanyView && !!user?.departmentId,
  });

  // Development team resolution + the Team-Lead-only access gate are shared
  // with the standalone /sprints and /bugs pages — see `useDevTeamAccess`.
  const { devTeam, isDevTeamLead, isPending: devLookupPending } = useDevTeamAccess();

  const loading = isCompanyView ? companyQuery.isLoading : departmentQuery.isLoading;

  if (isDevTeamLead && devTeam) {
    return <DevelopmentTeamDashboard team={devTeam} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}</h1>
        <p className="text-sm text-muted-foreground">
          {isCompanyView ? "Company-wide overview" : "Your department overview"}
        </p>
      </div>

      {loading || devLookupPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : isCompanyView && companyQuery.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active Projects" value={companyQuery.data.activeProjects} icon={FolderKanban} />
            <StatCard label="Total Employees" value={companyQuery.data.totalEmployees} icon={Users} />
            <StatCard
              label="Overdue Tasks"
              value={companyQuery.data.overdueTasksCount}
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label="Resource Utilization"
              value={`${Math.round(companyQuery.data.resourceUtilizationPct)}%`}
              icon={Gauge}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Projects" value={companyQuery.data.totalProjects} icon={Briefcase} />
            <StatCard label="Completed Projects" value={companyQuery.data.completedProjects} icon={CheckCircle2} />
            <StatCard label="Departments" value={companyQuery.data.totalDepartments} icon={Building2} />
            <StatCard label="Teams" value={companyQuery.data.totalTeams} icon={ClipboardList} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ProjectsByStatusCard
              counts={companyQuery.data.projectsByStatus}
              total={companyQuery.data.totalProjects}
            />
            <DepartmentPerformanceCard departments={companyQuery.data.departmentPerformance} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <UpcomingDeadlinesCard deadlines={companyQuery.data.upcomingDeadlines} />
            <TopWorkloadCard entries={companyQuery.data.topWorkload} />
          </div>

          <QuickLinksCard />
        </>
      ) : !isCompanyView && departmentQuery.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Projects" value={departmentQuery.data.activeProjects} icon={FolderKanban} />
          <StatCard label="Active Tasks" value={departmentQuery.data.activeTasks} icon={CheckCircle2} />
          <StatCard label="Overdue Tasks" value={departmentQuery.data.overdueTasks} icon={Building2} />
          <StatCard label="Utilization" value={`${Math.round(departmentQuery.data.utilizationPct)}%`} icon={Users} />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No department assigned</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ask your administrator to assign you to a department to see dashboard metrics.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
