"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProjectMethodology } from "@/lib/shared";
import { cn } from "@/lib/utils";
import { useIssueTrackerAccess } from "@/lib/dev-shared";
import { useRolePermissions } from "@/lib/role-permissions";
import { useAuthStore } from "@/store/auth-store";
import { adminNavItems, primaryNavItems, type NavItem } from "./nav-items";

function useVisibleNavItems(items: NavItem[]): NavItem[] {
  const role = useAuthStore((s) => s.user?.role);
  const permissionsQuery = useRolePermissions();
  // Sprints/Bugs are scoped to the Development team's Agile workflow, so a
  // Team Lead only sees those tabs when they can actually open the tracker
  // (Dev or QA lead — see `useIssueTrackerAccess`) and Development is Agile.
  // Any other Team Lead (e.g. IT, on Waterfall) never sees a dead-end tab.
  const { devTeam, canAccessTracker } = useIssueTrackerAccess();
  const canSeeTracker = canAccessTracker && devTeam?.methodology === ProjectMethodology.AGILE;

  return items
    .filter((item) => {
      // Matrix entry wins once loaded; the static `roles` array is only the
      // seed default and the fallback while permissions are still loading.
      const allowedRoles = item.key ? permissionsQuery.data?.[item.key] ?? item.roles : item.roles;
      return !allowedRoles || (role && allowedRoles.includes(role));
    })
    .filter((item) => !item.requiresAgileDevTeam || canSeeTracker);
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const visibleItems = useVisibleNavItems(items);

  return (
    <nav className="flex flex-col gap-1">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const visibleAdminItems = useVisibleNavItems(adminNavItems);

  return (
    <div className="flex h-full flex-col gap-6">
      <Link href="/dashboard" className="flex items-center gap-2 px-1">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-primary-foreground shadow-sm"
          style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))" }}
        >
          GS
        </span>
        <span className="text-base font-semibold">WorkHub</span>
      </Link>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
        <NavList items={primaryNavItems} onNavigate={onNavigate} />
        {visibleAdminItems.length > 0 && (
          <div>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Administration</p>
            <NavList items={adminNavItems} onNavigate={onNavigate} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card px-4 py-6 lg:block">
      <SidebarContent />
    </aside>
  );
}
