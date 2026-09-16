import { SUPER_ADMIN_LEVEL_ROLES, SystemRole } from "@/lib/shared";
import {
  Bug,
  Building2,
  CalendarClock,
  CheckSquare,
  ClipboardCheck,
  FolderKanban,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Paperclip,
  Rocket,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
  Bell,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles?: SystemRole[];
  /**
   * Stable id used by the Super Admin's Roles & Permissions matrix
   * (see `/admin/roles`) to look up which roles this module is currently
   * granted to. `roles` above is only the seed default and the fallback
   * used before that matrix has loaded — once loaded, the matrix entry for
   * this key wins. Items without a `key` (Roles & Permissions itself) are
   * never matrix-driven, so Super Admin can't accidentally lock everyone
   * out of the page that controls access.
   */
  key?: string;
  /**
   * Sprints and Bugs are Agile-only concepts — hidden from the nav entirely
   * when the Development team isn't running Agile (see `NavList` in
   * `sidebar.tsx`, which resolves this via `useDevTeamMethodology`).
   */
  requiresAgileDevTeam?: boolean;
}

export const primaryNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { label: "Projects", href: "/projects", icon: FolderKanban, key: "projects" },
  { label: "Tasks", href: "/tasks", icon: CheckSquare, key: "tasks" },
  {
    // Coarse role gate only — the page itself checks Development-team-lead
    // access (see `useDevTeamAccess` in @/lib/dev-shared).
    label: "Sprints",
    href: "/sprints",
    icon: Rocket,
    key: "sprints",
    roles: [...SUPER_ADMIN_LEVEL_ROLES, SystemRole.DEPARTMENT_MANAGER, SystemRole.TEAM_LEAD],
    requiresAgileDevTeam: true,
  },
  {
    // Coarse role gate only — the page itself checks Development-team-lead
    // access (see `useDevTeamAccess` in @/lib/dev-shared).
    label: "Bugs",
    href: "/bugs",
    icon: Bug,
    key: "bugs",
    roles: [...SUPER_ADMIN_LEVEL_ROLES, SystemRole.DEPARTMENT_MANAGER, SystemRole.TEAM_LEAD],
    requiresAgileDevTeam: true,
  },
  { label: "Workload", href: "/workload", icon: Gauge, key: "workload" },
  // The Development team's dashboard is no longer a separate nav entry — the main
  // "Dashboard" item renders it for the Development team's Team Lead.
  { label: "Timesheets", href: "/timesheets", icon: CalendarClock, key: "timesheets" },
  { label: "Approvals", href: "/approvals", icon: ClipboardCheck, key: "approvals" },
  { label: "Notifications", href: "/notifications", icon: Bell, key: "notifications" },
  { label: "Files", href: "/files", icon: Paperclip, key: "files" },
  { label: "Credentials", href: "/credentials", icon: KeyRound, key: "credentials" },
];

export const adminNavItems: NavItem[] = [
  {
    label: "Departments",
    href: "/departments",
    icon: Building2,
    key: "departments",
    roles: [...SUPER_ADMIN_LEVEL_ROLES, SystemRole.DEPARTMENT_MANAGER],
  },
  {
    label: "Employees",
    href: "/employees",
    icon: Users,
    key: "employees",
    roles: [...SUPER_ADMIN_LEVEL_ROLES, SystemRole.DEPARTMENT_MANAGER, SystemRole.DEPARTMENT_HEAD],
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    key: "settings",
    roles: [...SUPER_ADMIN_LEVEL_ROLES],
  },
  {
    label: "Teams",
    href: "/admin/teams",
    icon: UsersRound,
    key: "teams",
    roles: [...SUPER_ADMIN_LEVEL_ROLES, SystemRole.DEPARTMENT_MANAGER, SystemRole.DEPARTMENT_HEAD],
  },
  {
    // Deliberately NOT matrix-driven — no `key` — so this can never be
    // toggled away from Super-Admin-level roles via the matrix it controls.
    label: "Roles & Permissions",
    href: "/admin/roles",
    icon: ShieldCheck,
    roles: [...SUPER_ADMIN_LEVEL_ROLES],
  },
];

/** Every module the Roles & Permissions matrix can control, in display order. */
export const PERMISSION_MODULES: { key: string; label: string }[] = [
  ...primaryNavItems,
  ...adminNavItems,
]
  .filter((item): item is NavItem & { key: string } => !!item.key)
  .map((item) => ({ key: item.key, label: item.label }));
