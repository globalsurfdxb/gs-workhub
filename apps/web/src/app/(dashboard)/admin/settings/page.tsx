"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { isSuperAdminLevel, updateOrganizationSchema, type UpdateOrganizationInput } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api-client";
import { useModuleAccess } from "@/lib/role-permissions";
import { useAuthStore } from "@/store/auth-store";

interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

interface EmployeeProfile {
  id: string;
  fullName: string;
  email: string;
}

const updateNameSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(200),
});
type UpdateNameInput = z.infer<typeof updateNameSchema>;

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const updateAuthUser = useAuthStore((s) => s.updateUser);
  const isSuperAdmin = useModuleAccess("settings", isSuperAdminLevel(user?.role));
  const queryClient = useQueryClient();

  const organizationQuery = useQuery({
    queryKey: ["organization"],
    queryFn: () => api.get<Organization>("/organization"),
    enabled: isSuperAdmin,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
    values: organizationQuery.data
      ? { name: organizationQuery.data.name, slug: organizationQuery.data.slug }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: UpdateOrganizationInput) => api.patch<Organization>("/organization", values),
    onSuccess: () => {
      toast.success("Organization settings updated.");
      queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Unable to update settings.");
    },
  });

  const {
    register: registerName,
    handleSubmit: handleNameSubmit,
    formState: { errors: nameErrors },
  } = useForm<UpdateNameInput>({
    resolver: zodResolver(updateNameSchema),
    values: user ? { fullName: user.fullName } : undefined,
  });

  const updateNameMutation = useMutation({
    mutationFn: (values: UpdateNameInput) =>
      api.patch<EmployeeProfile>(`/employees/${user?.id}`, { fullName: values.fullName }),
    onSuccess: (data) => {
      toast.success("Your name has been updated.");
      updateAuthUser({ fullName: data.fullName });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Unable to update your name.");
    },
  });

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <CardTitle className="text-base">Access denied</CardTitle>
          <p className="text-sm text-muted-foreground">
            Only Super Admins can manage organization settings. Contact your administrator if you believe
            you should have access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage organization-wide details for GlobalSurf.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex max-w-md flex-col gap-4"
            onSubmit={handleNameSubmit((values) => updateNameMutation.mutate(values))}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-name">Full name</Label>
              <Input id="account-name" placeholder="e.g. Yusuf Rahman" {...registerName("fullName")} />
              {nameErrors.fullName && (
                <p className="text-xs text-destructive">{nameErrors.fullName.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                This is the name shown across GS WorkHub, including the top navigation bar.
              </p>
            </div>

            <div>
              <Button type="submit" disabled={updateNameMutation.isPending}>
                {updateNameMutation.isPending ? "Saving…" : "Save name"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
        </CardHeader>
        <CardContent>
          {organizationQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : organizationQuery.isError ? (
            <p className="text-sm text-muted-foreground">Unable to load organization settings.</p>
          ) : (
            <form
              className="flex max-w-md flex-col gap-4"
              onSubmit={handleSubmit((values) => mutation.mutate(values))}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-name">Organization name</Label>
                <Input id="org-name" placeholder="e.g. GlobalSurf" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-slug">Slug</Label>
                <Input id="org-slug" placeholder="e.g. globalsurf" {...register("slug")} />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens only. Used to identify your organization
                  internally.
                </p>
              </div>

              <div>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
