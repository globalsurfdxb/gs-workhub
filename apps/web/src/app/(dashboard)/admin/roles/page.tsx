"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isSuperAdminLevel, SystemRole } from "@/lib/shared";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { PERMISSION_MODULES } from "@/components/layout/nav-items";

const ROLE_ORDER: SystemRole[] = [
  SystemRole.SUPER_ADMIN,
  SystemRole.MANAGER,
  SystemRole.GENERAL_MANAGER,
  SystemRole.DEPARTMENT_MANAGER,
  SystemRole.DEPARTMENT_HEAD,
  SystemRole.TEAM_LEAD,
  SystemRole.EMPLOYEE,
  SystemRole.CLIENT,
];

const ROLE_LABEL: Record<SystemRole, string> = {
  [SystemRole.SUPER_ADMIN]: "Super Admin",
  [SystemRole.MANAGER]: "Manager",
  [SystemRole.GENERAL_MANAGER]: "General Manager",
  [SystemRole.DEPARTMENT_MANAGER]: "Dept. Manager",
  [SystemRole.DEPARTMENT_HEAD]: "Dept. Head",
  [SystemRole.TEAM_LEAD]: "Team Lead",
  [SystemRole.EMPLOYEE]: "Employee",
  [SystemRole.CLIENT]: "Client",
};

interface CustomRoleSummary {
  id: string;
  fullName: string;
}

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  moduleAccess: string[];
  createdBy: CustomRoleSummary;
  createdAt: string;
  updatedAt: string;
}

interface CustomRoleFormState {
  name: string;
  description: string;
  moduleAccess: string[];
}

function emptyCustomRoleForm(): CustomRoleFormState {
  return { name: "", description: "", moduleAccess: [] };
}

export default function RolePermissionsPage() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = isSuperAdminLevel(user?.role);
  const queryClient = useQueryClient();

  const permissionsQuery = useQuery({
    queryKey: ["role-permissions"],
    queryFn: () => api.get<Record<string, SystemRole[]>>("/role-permissions"),
    enabled: isSuperAdmin,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, roles }: { key: string; roles: SystemRole[] }) =>
      api.patch<{ key: string; roles: SystemRole[] }>(`/role-permissions/${key}`, { roles }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Unable to update permissions.");
    },
  });

  const customRolesQuery = useQuery({
    queryKey: ["custom-roles"],
    queryFn: () => api.get<CustomRole[]>("/custom-roles"),
    enabled: isSuperAdmin,
  });

  const [roleDialog, setRoleDialog] = useState<{ mode: "create" } | { mode: "edit"; role: CustomRole } | null>(
    null,
  );
  const [roleForm, setRoleForm] = useState<CustomRoleFormState>(emptyCustomRoleForm());
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<CustomRole | null>(null);

  const invalidateCustomRoles = () => queryClient.invalidateQueries({ queryKey: ["custom-roles"] });

  const createRoleMutation = useMutation({
    mutationFn: (values: CustomRoleFormState) => api.post<CustomRole>("/custom-roles", values),
    onSuccess: () => {
      toast.success("Role created.");
      setRoleDialog(null);
      invalidateCustomRoles();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to create role.");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: CustomRoleFormState }) =>
      api.patch<CustomRole>(`/custom-roles/${id}`, values),
    onSuccess: () => {
      toast.success("Role updated.");
      setRoleDialog(null);
      invalidateCustomRoles();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to update role.");
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/custom-roles/${id}`),
    onSuccess: () => {
      toast.success("Role deleted.");
      setDeleteRoleTarget(null);
      invalidateCustomRoles();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete role.");
    },
  });

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <CardTitle className="text-base">Access denied</CardTitle>
          <p className="text-sm text-muted-foreground">
            Only Super Admins can manage role permissions. Contact your administrator if you believe you
            should have access.
          </p>
        </CardContent>
      </Card>
    );
  }

  function handleToggle(moduleKey: string, role: SystemRole, checked: boolean) {
    if (role === SystemRole.SUPER_ADMIN) return; // always on, never editable
    const current = permissionsQuery.data?.[moduleKey] ?? [];
    const next = checked ? [...current, role] : current.filter((r) => r !== role);
    toggleMutation.mutate({ key: moduleKey, roles: next });
  }

  function openCreateRole() {
    setRoleForm(emptyCustomRoleForm());
    setRoleDialog({ mode: "create" });
  }

  function openEditRole(role: CustomRole) {
    setRoleForm({ name: role.name, description: role.description ?? "", moduleAccess: role.moduleAccess });
    setRoleDialog({ mode: "edit", role });
  }

  function toggleRoleModule(moduleKey: string) {
    setRoleForm((prev) => ({
      ...prev,
      moduleAccess: prev.moduleAccess.includes(moduleKey)
        ? prev.moduleAccess.filter((key) => key !== moduleKey)
        : [...prev.moduleAccess, moduleKey],
    }));
  }

  function handleRoleSubmit() {
    if (!roleForm.name.trim()) {
      toast.error("Give this role a name.");
      return;
    }
    if (roleDialog?.mode === "edit") {
      updateRoleMutation.mutate({ id: roleDialog.role.id, values: roleForm });
    } else {
      createRoleMutation.mutate(roleForm);
    }
  }

  const isSavingRole = createRoleMutation.isPending || updateRoleMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Roles &amp; Permissions</h1>
        <p className="text-sm text-muted-foreground">
          Control which roles can see each area of GS WorkHub. Super Admin always has access and can&apos;t
          be removed from any module.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Module access matrix</CardTitle>
        </CardHeader>
        <CardContent>
          {permissionsQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : permissionsQuery.isError ? (
            <p className="text-sm text-muted-foreground">Unable to load role permissions.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Module</TableHead>
                    {ROLE_ORDER.map((role) => (
                      <TableHead key={role} className="text-center whitespace-nowrap">
                        {ROLE_LABEL[role]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERMISSION_MODULES.map((module) => {
                    const allowedRoles = permissionsQuery.data?.[module.key] ?? [];
                    return (
                      <TableRow key={module.key}>
                        <TableCell className="whitespace-nowrap font-medium">{module.label}</TableCell>
                        {ROLE_ORDER.map((role) => {
                          const checked = role === SystemRole.SUPER_ADMIN || allowedRoles.includes(role);
                          return (
                            <TableCell key={role} className="text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                                checked={checked}
                                disabled={role === SystemRole.SUPER_ADMIN || toggleMutation.isPending}
                                onChange={(event) => handleToggle(module.key, role, event.target.checked)}
                                aria-label={`${ROLE_LABEL[role]} access to ${module.label}`}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">Custom roles</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Define a named role and the modules it can access. Not yet assignable to an employee record —
              this defines what the role should see ahead of that.
            </p>
          </div>
          <Button onClick={openCreateRole}>
            <Plus className="h-4 w-4" />
            Create Role
          </Button>
        </CardHeader>
        <CardContent>
          {customRolesQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : customRolesQuery.isError ? (
            <p className="text-sm text-muted-foreground">Unable to load custom roles.</p>
          ) : (customRolesQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No custom roles yet. Create one to define a permission set beyond the built-in roles above.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {(customRolesQuery.data ?? []).map((role) => (
                <div key={role.id} className="flex flex-col gap-2 rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{role.name}</p>
                      {role.description && (
                        <p className="text-sm text-muted-foreground">{role.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditRole(role)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteRoleTarget(role)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {role.moduleAccess.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No modules selected.</span>
                    ) : (
                      role.moduleAccess.map((key) => {
                        const module = PERMISSION_MODULES.find((item) => item.key === key);
                        return (
                          <Badge key={key} variant="secondary">
                            {module?.label ?? key}
                          </Badge>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={roleDialog !== null} onOpenChange={(open) => !open && setRoleDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{roleDialog?.mode === "edit" ? "Edit Role" : "Create Role"}</DialogTitle>
            <DialogDescription>Name the role and choose which modules it can access.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                value={roleForm.name}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. Regional Coordinator"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-description">Description (optional)</Label>
              <Textarea
                id="role-description"
                rows={2}
                value={roleForm.description}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="What is this role for?"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Module access</Label>
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                {PERMISSION_MODULES.map((module) => (
                  <label
                    key={module.key}
                    className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={roleForm.moduleAccess.includes(module.key)}
                      onChange={() => toggleRoleModule(module.key)}
                    />
                    {module.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleRoleSubmit} disabled={isSavingRole}>
              {isSavingRole ? "Saving…" : roleDialog?.mode === "edit" ? "Save changes" : "Create role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteRoleTarget} onOpenChange={(open) => !open && setDeleteRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{deleteRoleTarget?.name}&rdquo;. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteRoleTarget && deleteRoleMutation.mutate(deleteRoleTarget.id)}
              disabled={deleteRoleMutation.isPending}
            >
              {deleteRoleMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
