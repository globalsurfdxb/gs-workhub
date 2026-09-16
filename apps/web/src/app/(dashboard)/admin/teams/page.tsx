"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  createTeamSchema,
  isSuperAdminLevel,
  ProjectMethodology,
  SystemRole,
  type CreateTeamInput,
  type Department,
  type Team,
} from "@/lib/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiError } from "@/lib/api-client";
import { PROJECT_METHODOLOGY_LABELS, projectMethodologyBadgeVariant } from "@/lib/methodology";
import { useAuthStore } from "@/store/auth-store";

interface TeamListItem extends Team {
  teamLead?: { id: string; fullName: string; email: string; designation?: string | null } | null;
  memberIds: string[];
  _count: { members: number; projects: number };
}

interface TeamMember {
  id: string;
  userId: string;
  joinedAt: string;
  fullName: string;
  email: string;
  designation?: string | null;
}

interface TeamDetail extends Omit<TeamListItem, "_count"> {
  members: TeamMember[];
  memberCount: number;
}

interface EmployeeOption {
  id: string;
  fullName: string;
  email: string;
}

const NO_LEAD_VALUE = "__none__";

const createTeamFormSchema = createTeamSchema.omit({ departmentId: true });
type CreateTeamFormValues = z.infer<typeof createTeamFormSchema>;

function canManageTeams(role?: SystemRole): boolean {
  return (
    isSuperAdminLevel(role) || role === SystemRole.DEPARTMENT_MANAGER || role === SystemRole.DEPARTMENT_HEAD
  );
}

function canManageMembers(role?: SystemRole): boolean {
  return (
    isSuperAdminLevel(role) ||
    role === SystemRole.DEPARTMENT_MANAGER ||
    role === SystemRole.DEPARTMENT_HEAD ||
    role === SystemRole.TEAM_LEAD
  );
}

export default function AdminTeamsPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [manageMembersTeamId, setManageMembersTeamId] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState<string>("");

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
  });

  useEffect(() => {
    const departments = departmentsQuery.data;
    const firstDepartment = departments?.[0];
    if (!selectedDepartmentId && firstDepartment) {
      const preferred = currentUser?.departmentId
        ? departments.find((dept) => dept.id === currentUser.departmentId)
        : undefined;
      setSelectedDepartmentId((preferred ?? firstDepartment).id);
    }
  }, [departmentsQuery.data, selectedDepartmentId, currentUser?.departmentId]);

  const teamsQuery = useQuery({
    queryKey: ["teams", selectedDepartmentId],
    queryFn: () => api.get<TeamListItem[]>(`/teams?departmentId=${selectedDepartmentId}`),
    enabled: !!selectedDepartmentId,
  });

  const departmentEmployeesQuery = useQuery({
    queryKey: ["employees", "by-department", selectedDepartmentId],
    queryFn: () =>
      api.get<{ data: EmployeeOption[] }>(`/employees?departmentId=${selectedDepartmentId}&pageSize=200`),
    enabled: !!selectedDepartmentId,
  });

  const teamDetailQuery = useQuery({
    queryKey: ["teams", "detail", manageMembersTeamId],
    queryFn: () => api.get<TeamDetail>(`/teams/${manageMembersTeamId}`),
    enabled: !!manageMembersTeamId,
  });

  const createForm = useForm<CreateTeamFormValues>({
    resolver: zodResolver(createTeamFormSchema),
    defaultValues: { name: "", code: "", capacityHoursPerWeek: 40, methodology: ProjectMethodology.AGILE },
  });

  const createTeamMutation = useMutation({
    mutationFn: (values: CreateTeamFormValues) => {
      const payload: CreateTeamInput = {
        ...values,
        departmentId: selectedDepartmentId,
        teamLeadId: values.teamLeadId || undefined,
      };
      return api.post<TeamListItem>("/teams", payload);
    },
    onSuccess: () => {
      toast.success("Team created.");
      setIsCreateOpen(false);
      createForm.reset({ name: "", code: "", capacityHoursPerWeek: 40, methodology: ProjectMethodology.AGILE });
      queryClient.invalidateQueries({ queryKey: ["teams", selectedDepartmentId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to create team.");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ teamId, archive }: { teamId: string; archive: boolean }) =>
      api.patch(`/teams/${teamId}/${archive ? "archive" : "unarchive"}`),
    onSuccess: (_data, variables) => {
      toast.success(variables.archive ? "Team archived." : "Team unarchived.");
      queryClient.invalidateQueries({ queryKey: ["teams", selectedDepartmentId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to update team.");
    },
  });

  const updateMethodologyMutation = useMutation({
    mutationFn: ({ teamId, methodology }: { teamId: string; methodology: ProjectMethodology }) =>
      api.patch(`/teams/${teamId}`, { methodology }),
    onSuccess: () => {
      toast.success("Team methodology updated.");
      queryClient.invalidateQueries({ queryKey: ["teams", selectedDepartmentId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to update methodology.");
    },
  });

  const updateTeamLeadMutation = useMutation({
    mutationFn: ({ teamId, teamLeadId }: { teamId: string; teamLeadId: string | null }) =>
      api.patch(`/teams/${teamId}`, { teamLeadId }),
    onSuccess: () => {
      toast.success("Team lead updated.");
      queryClient.invalidateQueries({ queryKey: ["teams", selectedDepartmentId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to update team lead.");
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      api.post(`/teams/${teamId}/members`, { userId }),
    onSuccess: (_data, variables) => {
      toast.success("Member added.");
      setNewMemberId("");
      queryClient.invalidateQueries({ queryKey: ["teams", "detail", variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams", selectedDepartmentId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to add member.");
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      api.delete(`/teams/${teamId}/members/${userId}`),
    onSuccess: (_data, variables) => {
      toast.success("Member removed.");
      queryClient.invalidateQueries({ queryKey: ["teams", "detail", variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams", selectedDepartmentId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to remove member.");
    },
  });

  const teams = teamsQuery.data ?? [];
  const availableEmployees = departmentEmployeesQuery.data?.data ?? [];
  const managedTeam = teamDetailQuery.data;
  const memberIds = new Set(managedTeam?.members.map((m) => m.userId) ?? []);
  const addableEmployees = availableEmployees.filter((employee) => !memberIds.has(employee.id));
  const userCanManageTeams = canManageTeams(currentUser?.role);
  const userCanManageMembers = canManageMembers(currentUser?.role);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team Management</h1>
          <p className="text-sm text-muted-foreground">Manage teams, membership, and capacity by department.</p>
        </div>
        {userCanManageTeams && (
          <Button onClick={() => setIsCreateOpen(true)} disabled={!selectedDepartmentId}>
            <Plus className="h-4 w-4" />
            Create Team
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Label htmlFor="department-picker" className="shrink-0">
            Department
          </Label>
          <Select
            value={selectedDepartmentId}
            onValueChange={setSelectedDepartmentId}
            disabled={currentUser?.role === SystemRole.DEPARTMENT_HEAD}
          >
            <SelectTrigger id="department-picker" className="w-full sm:w-64">
              <SelectValue placeholder="Select a department" />
            </SelectTrigger>
            <SelectContent>
              {departmentsQuery.data?.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selectedDepartmentId ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {departmentsQuery.isLoading ? "Loading departments…" : "No department available to display."}
          </CardContent>
        </Card>
      ) : teamsQuery.isLoading ? (
        <Skeleton className="h-64" />
      ) : teamsQuery.isError ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-destructive">Failed to load teams.</CardContent>
        </Card>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No teams in this department yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Team Lead</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Capacity (hrs/wk)</TableHead>
                <TableHead>Methodology</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell>{team.code}</TableCell>
                  <TableCell>
                    {userCanManageTeams ? (
                      (() => {
                        const teamMemberOptions = availableEmployees.filter((employee) =>
                          team.memberIds.includes(employee.id),
                        );
                        // Keep the current lead selectable/visible even if legacy data left them
                        // off the team roster, without allowing non-members to be picked otherwise.
                        if (team.teamLead && !team.memberIds.includes(team.teamLead.id)) {
                          teamMemberOptions.push(team.teamLead);
                        }
                        return (
                          <Select
                            value={team.teamLeadId ?? NO_LEAD_VALUE}
                            onValueChange={(value) =>
                              updateTeamLeadMutation.mutate({
                                teamId: team.id,
                                teamLeadId: value === NO_LEAD_VALUE ? null : value,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[170px]">
                              <SelectValue placeholder="No team lead" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_LEAD_VALUE}>No team lead</SelectItem>
                              {teamMemberOptions.length === 0 ? (
                                <SelectItem value="__no_members__" disabled>
                                  No team members yet
                                </SelectItem>
                              ) : (
                                teamMemberOptions.map((employee) => (
                                  <SelectItem key={employee.id} value={employee.id}>
                                    {employee.fullName}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        );
                      })()
                    ) : (
                      team.teamLead?.fullName ?? "—"
                    )}
                  </TableCell>
                  <TableCell>{team._count.members}</TableCell>
                  <TableCell>{team.capacityHoursPerWeek}</TableCell>
                  <TableCell>
                    {userCanManageTeams ? (
                      <Select
                        value={team.methodology}
                        onValueChange={(value) =>
                          updateMethodologyMutation.mutate({
                            teamId: team.id,
                            methodology: value as ProjectMethodology,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(ProjectMethodology).map((methodology) => (
                            <SelectItem key={methodology} value={methodology}>
                              {PROJECT_METHODOLOGY_LABELS[methodology]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={projectMethodologyBadgeVariant(team.methodology)}>
                        {PROJECT_METHODOLOGY_LABELS[team.methodology]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {team.isArchived ? (
                      <Badge variant="muted">Archived</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setManageMembersTeamId(team.id)}>
                        <Users className="h-4 w-4" />
                        Members
                      </Button>
                      {userCanManageTeams && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={archiveMutation.isPending}
                          onClick={() =>
                            archiveMutation.mutate({ teamId: team.id, archive: !team.isArchived })
                          }
                        >
                          {team.isArchived ? (
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
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              New team in {departmentsQuery.data?.find((d) => d.id === selectedDepartmentId)?.name ?? "the selected department"}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={createForm.handleSubmit((values) => createTeamMutation.mutate(values))}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-name">Name</Label>
              <Input id="team-name" placeholder="e.g. Platform Engineering" {...createForm.register("name")} />
              {createForm.formState.errors.name && (
                <p className="text-xs text-destructive">{createForm.formState.errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-code">Code</Label>
              <Controller
                control={createForm.control}
                name="code"
                render={({ field }) => (
                  <Input
                    id="team-code"
                    placeholder="e.g. PLAT-ENG"
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                  />
                )}
              />
              {createForm.formState.errors.code && (
                <p className="text-xs text-destructive">{createForm.formState.errors.code.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-lead">Team Lead (optional)</Label>
              <Controller
                control={createForm.control}
                name="teamLeadId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NO_LEAD_VALUE}
                    onValueChange={(value) => field.onChange(value === NO_LEAD_VALUE ? undefined : value)}
                  >
                    <SelectTrigger id="team-lead">
                      <SelectValue placeholder="No team lead" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_LEAD_VALUE}>No team lead</SelectItem>
                      {availableEmployees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-capacity">Capacity (hours/week)</Label>
              <Input
                id="team-capacity"
                type="number"
                min={0}
                step="1"
                {...createForm.register("capacityHoursPerWeek", { valueAsNumber: true })}
              />
              {createForm.formState.errors.capacityHoursPerWeek && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.capacityHoursPerWeek.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-methodology">Methodology</Label>
              <Controller
                control={createForm.control}
                name="methodology"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="team-methodology">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ProjectMethodology).map((methodology) => (
                        <SelectItem key={methodology} value={methodology}>
                          {PROJECT_METHODOLOGY_LABELS[methodology]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                New projects created under this team default to this methodology.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTeamMutation.isPending}>
                {createTeamMutation.isPending ? "Creating…" : "Create team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!manageMembersTeamId}
        onOpenChange={(open) => {
          if (!open) {
            setManageMembersTeamId(null);
            setNewMemberId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Members</DialogTitle>
            <DialogDescription>{managedTeam?.name ?? "Team"} membership.</DialogDescription>
          </DialogHeader>

          {teamDetailQuery.isLoading ? (
            <Skeleton className="h-40" />
          ) : teamDetailQuery.isError || !managedTeam ? (
            <p className="text-sm text-destructive">Failed to load team details.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {managedTeam.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members yet.</p>
                ) : (
                  managedTeam.members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{member.fullName}</p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      {userCanManageMembers && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removeMemberMutation.isPending}
                          onClick={() =>
                            removeMemberMutation.mutate({ teamId: managedTeam.id, userId: member.userId })
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {userCanManageMembers && (
                <div className="flex items-end gap-2 border-t pt-4">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="add-member">Add member</Label>
                    <Select value={newMemberId} onValueChange={setNewMemberId}>
                      <SelectTrigger id="add-member">
                        <SelectValue placeholder="Select an employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {addableEmployees.length === 0 ? (
                          <SelectItem value={NO_LEAD_VALUE} disabled>
                            No eligible employees
                          </SelectItem>
                        ) : (
                          addableEmployees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.fullName}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={!newMemberId || addMemberMutation.isPending}
                    onClick={() => addMemberMutation.mutate({ teamId: managedTeam.id, userId: newMemberId })}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageMembersTeamId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
