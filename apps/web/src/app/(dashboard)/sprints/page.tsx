"use client";

import { ProjectMethodology } from "@/lib/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIssueTrackerAccess } from "@/lib/dev-shared";
import { DevSprintsTab } from "./dev-sprints-tab";

/**
 * Standalone Sprints page — its own nav item (matching Tasks/Projects), not a
 * Dashboard tab. Open to the Development team's Team Lead and the QA team's
 * Team Lead; see `useIssueTrackerAccess` in `@/lib/dev-shared` for the gate.
 *
 * Sprints belong to the Development team, so the data `teamId` is `devTeam.id`
 * for both viewers — QA reads the board to track delivery it has to verify.
 */
export default function SprintsPage() {
  const { devTeam, canAccessTracker, isPending, isError } = useIssueTrackerAccess();

  const header = (
    <div>
      <h1 className="text-2xl font-semibold">Sprints</h1>
      <p className="text-sm text-muted-foreground">
        Sprint planning and delivery tracking for the Development team
      </p>
    </div>
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Sprints unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            We could not load sprint data. Please refresh the page and try again.
          </CardContent>
        </Card>
      </div>
    );
  }

  // `devTeam` is required even for the QA lead — sprints are the Development
  // team's, and that is the team this board reports on.
  if (!canAccessTracker || !devTeam) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>
              This page is for the Development team&apos;s Team Lead or the QA team&apos;s Team
              Lead
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ask your Team Lead or Department Manager if you need visibility into sprint planning.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (devTeam.methodology !== ProjectMethodology.AGILE) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Sprints require the Agile methodology</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The Development team is currently set to {devTeam.methodology.toLowerCase()}. Switch it to
            Agile from Team Management to plan and track sprints.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <DevSprintsTab teamId={devTeam.id} />
    </div>
  );
}
