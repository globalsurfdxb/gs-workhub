"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { CredentialCategory, isDepartmentLevel, SystemRole } from "@/lib/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";

interface UserSummary {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
}

interface Credential {
  id: string;
  projectId: string | null;
  projectName: string | null;
  label: string;
  category: CredentialCategory;
  username: string | null;
  password: string;
  url: string | null;
  notes: string | null;
  sharedWithUserIds: string[];
  sharedWith: UserSummary[];
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ProjectsListResponse {
  data: ProjectOption[];
}

interface EmployeeOption {
  id: string;
  fullName: string;
  email: string;
}

interface EmployeesListResponse {
  data: EmployeeOption[];
}

const CATEGORY_LABELS: Record<CredentialCategory, string> = {
  [CredentialCategory.SERVER]: "Server / Backend",
  [CredentialCategory.CPANEL]: "cPanel",
  [CredentialCategory.DOMAIN]: "Domain",
  [CredentialCategory.CMS]: "CMS",
  [CredentialCategory.DATABASE]: "Database",
  [CredentialCategory.FTP]: "FTP",
  [CredentialCategory.EMAIL]: "Email",
  [CredentialCategory.OTHER]: "Other",
};

const CREDENTIALS_QUERY_ROOT = ["credentials"] as const;
const ALL_PROJECTS = "ALL";
const ALL_CATEGORIES = "ALL";
const ANY_EMPLOYEE = "ALL";
const NO_PROJECT = "__none__";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface CredentialFormState {
  projectId: string;
  label: string;
  category: CredentialCategory;
  username: string;
  password: string;
  url: string;
  notes: string;
  sharedWithUserIds: string[];
}

function emptyForm(defaultProjectId: string): CredentialFormState {
  return {
    projectId: defaultProjectId,
    label: "",
    category: CredentialCategory.OTHER,
    username: "",
    password: "",
    url: "",
    notes: "",
    sharedWithUserIds: [],
  };
}

export default function CredentialsPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  // Team Lead can add credentials but — per `canManageAny` below — can only
  // ever edit/delete the ones they personally created.
  const canCreate = isDepartmentLevel(currentUser?.role) || currentUser?.role === SystemRole.TEAM_LEAD;
  const canManageAny = isDepartmentLevel(currentUser?.role);

  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [employeeFilter, setEmployeeFilter] = useState(ANY_EMPLOYEE);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [dialogState, setDialogState] = useState<{ mode: "create" } | { mode: "edit"; credential: Credential } | null>(
    null,
  );
  const [form, setForm] = useState<CredentialFormState>(emptyForm(NO_PROJECT));
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects", "for-credentials"],
    queryFn: () => api.get<ProjectsListResponse>("/projects?pageSize=200"),
  });
  const projects = projectsQuery.data?.data ?? [];

  const employeesQuery = useQuery({
    queryKey: ["employees", "for-credentials"],
    queryFn: () => api.get<EmployeesListResponse>("/employees?pageSize=200"),
  });
  const employeeOptions = employeesQuery.data?.data ?? [];

  const credentialsQuery = useQuery({
    queryKey: [...CREDENTIALS_QUERY_ROOT, projectFilter],
    queryFn: () =>
      api.get<Credential[]>(
        `/credentials${projectFilter !== ALL_PROJECTS ? `?projectId=${projectFilter}` : ""}`,
      ),
  });
  const credentialList = (credentialsQuery.data ?? [])
    .filter((credential) => categoryFilter === ALL_CATEGORIES || credential.category === categoryFilter)
    .filter(
      (credential) =>
        employeeFilter === ANY_EMPLOYEE ||
        credential.createdBy.id === employeeFilter ||
        credential.sharedWithUserIds.includes(employeeFilter),
    );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_ROOT });

  const createMutation = useMutation({
    mutationFn: (values: CredentialFormState) =>
      api.post<Credential>("/credentials", {
        ...values,
        projectId: values.projectId === NO_PROJECT ? undefined : values.projectId,
      }),
    onSuccess: () => {
      toast.success("Credential added.");
      setDialogState(null);
      invalidate();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to add credential.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: CredentialFormState }) =>
      api.patch<Credential>(`/credentials/${id}`, {
        ...values,
        projectId: values.projectId === NO_PROJECT ? null : values.projectId,
      }),
    onSuccess: () => {
      toast.success("Credential updated.");
      setDialogState(null);
      invalidate();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to update credential.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/credentials/${id}`),
    onSuccess: () => {
      toast.success("Credential deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete credential.");
    },
  });

  function openCreate() {
    setForm(emptyForm(projectFilter !== ALL_PROJECTS ? projectFilter : NO_PROJECT));
    setDialogState({ mode: "create" });
  }

  function openEdit(credential: Credential) {
    setForm({
      projectId: credential.projectId ?? NO_PROJECT,
      label: credential.label,
      category: credential.category,
      username: credential.username ?? "",
      password: credential.password,
      url: credential.url ?? "",
      notes: credential.notes ?? "",
      sharedWithUserIds: credential.sharedWithUserIds,
    });
    setDialogState({ mode: "edit", credential });
  }

  function toggleShare(userId: string) {
    setForm((prev) => ({
      ...prev,
      sharedWithUserIds: prev.sharedWithUserIds.includes(userId)
        ? prev.sharedWithUserIds.filter((id) => id !== userId)
        : [...prev.sharedWithUserIds, userId],
    }));
  }

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  function handleSubmit() {
    if (!form.label.trim()) {
      toast.error("Give this credential a label.");
      return;
    }
    if (dialogState?.mode === "edit") {
      updateMutation.mutate({ id: dialogState.credential.id, values: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Credentials</h1>
          <p className="text-sm text-muted-foreground">
            Store backend, cPanel, domain, and CMS logins, optionally linked to a project, and share access
            with specific employees.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Credential
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="project-filter">Project</Label>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger id="project-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROJECTS}>All Projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="category-filter">Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="category-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>All Categories</SelectItem>
                {Object.values(CredentialCategory).map((category) => (
                  <SelectItem key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Employee filter only makes sense for roles that can see across
              multiple people's credentials (Team Lead and up) — a plain
              Employee only ever sees their own + shared-with-them items, so
              there's nothing for them to filter by. */}
          {canCreate && (
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="employee-filter">Employee</Label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger id="employee-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_EMPLOYEE}>Anyone</SelectItem>
                  {employeeOptions.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {credentialsQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : credentialsQuery.isError ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-destructive">
            Failed to load credentials.
          </CardContent>
        </Card>
      ) : credentialList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <KeyRound className="h-8 w-8" />
            {(credentialsQuery.data ?? []).length === 0
              ? "No credentials stored yet. Add one to get started."
              : "No credentials match these filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {credentialList.map((credential) => {
            const revealed = revealedIds.has(credential.id);
            const canEditThis = canManageAny || credential.createdBy.id === currentUser?.id;
            return (
              <Card key={credential.id}>
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{credential.label}</span>
                      <Badge variant="outline">{CATEGORY_LABELS[credential.category]}</Badge>
                      <Badge variant="secondary">{credential.projectName ?? "No project"}</Badge>
                    </div>
                    {canEditThis && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(credential)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteTarget(credential)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {credential.username && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Username</span>
                        <span className="text-sm font-medium">{credential.username}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Password</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm">
                          {revealed ? credential.password || "—" : "••••••••"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => toggleReveal(credential.id)}
                          title={revealed ? "Hide" : "Reveal"}
                        >
                          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => copyPassword(credential.password)}
                          title="Copy password"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {credential.url && (
                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-xs text-muted-foreground">URL</span>
                        <a
                          href={credential.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="truncate text-sm text-primary hover:underline"
                        >
                          {credential.url}
                        </a>
                      </div>
                    )}
                    {credential.notes && (
                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-xs text-muted-foreground">Notes</span>
                        <span className="text-sm text-muted-foreground">{credential.notes}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span>Shared with:</span>
                      {credential.sharedWith.length === 0 ? (
                        <span>Nobody yet</span>
                      ) : (
                        <div className="flex -space-x-1.5">
                          {credential.sharedWith.map((person) => (
                            <Avatar key={person.id} className="h-6 w-6 border-2 border-background" title={person.fullName}>
                              <AvatarFallback className="text-[10px]">{initials(person.fullName)}</AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      )}
                    </div>
                    <span>
                      Added by {credential.createdBy.fullName} · {format(new Date(credential.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogState !== null} onOpenChange={(open) => !open && setDialogState(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogState?.mode === "edit" ? "Edit Credential" : "Add Credential"}</DialogTitle>
            <DialogDescription>Choose who on the team can see this.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cred-label">Label</Label>
                <Input
                  id="cred-label"
                  value={form.label}
                  onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="e.g. Production cPanel"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cred-category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as CredentialCategory }))}
                >
                  <SelectTrigger id="cred-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(CredentialCategory).map((category) => (
                      <SelectItem key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cred-project">Project (optional)</Label>
              <Select
                value={form.projectId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, projectId: value }))}
              >
                <SelectTrigger id="cred-project">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>No project (general)</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Link this to a project only if it's related to one — otherwise leave it general.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cred-username">Username</Label>
                <Input
                  id="cred-username"
                  value={form.username}
                  onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                  placeholder="e.g. admin@globalsurf.ae"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cred-password">Password</Label>
                <Input
                  id="cred-password"
                  type="text"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Enter password"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cred-url">URL (optional)</Label>
              <Input
                id="cred-url"
                value={form.url}
                onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="https://…"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cred-notes">Notes (optional)</Label>
              <Textarea
                id="cred-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Anything the team should know…"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Share with</Label>
              {employeesQuery.isLoading ? (
                <Skeleton className="h-24" />
              ) : employeeOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No employees found.</p>
              ) : (
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {employeeOptions.map((employee) => (
                    <label
                      key={employee.id}
                      className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={form.sharedWithUserIds.includes(employee.id)}
                        onChange={() => toggleShare(employee.id)}
                      />
                      {employee.fullName}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Checked employees can view this credential even without department-level access.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogState(null)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? "Saving…" : dialogState?.mode === "edit" ? "Save changes" : "Add credential"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete credential?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{deleteTarget?.label}&rdquo;. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
