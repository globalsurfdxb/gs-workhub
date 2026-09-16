"use client";

/**
 * Super Admin's Roles & Permissions matrix (`/admin/roles`) — shared by the
 * sidebar (which nav items show) and each matrix-controlled page's own
 * access guard (so a visible nav item never dead-ends on an "Access denied"
 * card). See `PERMISSION_MODULES` in `@/components/layout/nav-items` for the
 * full list of controllable module keys.
 */

import { useQuery } from "@tanstack/react-query";
import type { SystemRole } from "@/lib/shared";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";

export function useRolePermissions() {
  return useQuery({
    queryKey: ["role-permissions"],
    queryFn: () => api.get<Record<string, SystemRole[]>>("/role-permissions"),
  });
}

/**
 * Whether the signed-in user can access a matrix-controlled module.
 * `fallbackAllowed` — the page's own static role check — is used until the
 * matrix has loaded (or if the key is somehow missing), so there's no access
 * flash while fetching.
 */
export function useModuleAccess(key: string, fallbackAllowed: boolean): boolean {
  const role = useAuthStore((s) => s.user?.role);
  const { data } = useRolePermissions();
  const allowedRoles = data?.[key];
  if (!allowedRoles) return fallbackAllowed;
  return !!role && allowedRoles.includes(role);
}
