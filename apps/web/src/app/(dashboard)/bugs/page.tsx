"use client";

import { ProjectMethodology } from "@/lib/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIssueTrackerAccess } from "@/lib/dev-shared";
import { DevBugsTab } from "./dev-bugs-tab";

/**
 * Standalone Bugs page — its own nav item (matching Tasks/Projects), not a
 * Dashboard tab. Open to the Development team's Team Lead and the QA team's
 * Team Lead; see `useIssueTrackerAccess` in `@/lib/dev-shared` for the gate.
 *
 * The board is always scoped to the Development team's projects (bugs are
 * raised against Development's projects — QA doesn't own its own project
 * backlog here), so the data `teamId` is `devTeam.id` for both viewers.
 */
export default function BugsPage() {
  const { devTeam, canAccessTracker, isPending, isError } = useIssueTrackerAccess();

  const header = (
    <div>
      <h1 className="text-2xl font-semibold">Bugs</h1>
      <p className="text-sm text-muted-foreground">
        Defect tracking for the Development team — reported by QA, fixed by Development,
        verified in QA Review
      </p>
    </div>
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Bugs unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            We could not load bug data. Please refresh the page and try again.
          </CardContent>
        </Card>
      </div>
    );
  }

  // `devTeam` is required even for the QA lead — it is the team whose projects
  // the bug board is scoped to.
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
            Ask your Team Lead or Department Manager if you need visibility into bug tracking.
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
            <CardTitle>Bug tracking requires the Agile methodology</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The Development team is currently set to {devTeam.methodology.toLowerCase()}. Switch it to
            Agile from Team Management to track bugs here.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <DevBugsTab teamId={devTeam.id} />
    </div>
  );
}
