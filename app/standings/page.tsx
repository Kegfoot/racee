"use client";

import { useMemo } from "react";
import Link from "next/link";
import { HistoryIcon, ScrollTextIcon } from "lucide-react";
import { SeasonBanner } from "./SeasonBanner";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/ui/page-shell";
import { QueryError } from "@/components/ui/query-state";
import { useUser } from "@/app/context/UserContext";
import { useLeague } from "@/app/context/LeagueContext";
import { orpc } from "@/lib/orpc/client";
import { StandingsGrid } from "./StandingsGrid";
import { FinaleLauncher } from "./finale/FinaleLauncher";
import { FinalePendingSplash } from "./finale/FinalePendingSplash";
import { mergeReplacedRaceColumns, orderSeasonRaces } from "@/lib/race-order";

export default function ViewPage() {
  const { user, isLoading: userLoading } = useUser();
  const { activeLeagueId } = useLeague();
  const enabled = !!user && !!activeLeagueId;
  const leagueInput = { leagueId: activeLeagueId ?? "" };

  const leagueQuery = useQuery(orpc.leagues.get.queryOptions({ input: leagueInput, enabled }));
  const teamsQuery = useQuery(orpc.leagues.teams.list.queryOptions({ input: leagueInput, enabled }));
  const racesQuery = useQuery(orpc.races.list.queryOptions({ input: leagueInput, enabled }));
  const standingsQuery = useQuery(orpc.standings.get.queryOptions({ input: leagueInput, enabled }));

  const queries = [leagueQuery, teamsQuery, racesQuery, standingsQuery];
  const isPending = queries.some((q) => q.isPending);
  const firstError = queries.find((q) => q.isError);

  // races.list doesn't sort, and the stage arrays reference raceIds positionally,
  // so season order is re-established here: by date, with each replacement race
  // placed right after the cancelled race it replaces (same as the server's stages).
  const sortedRaces = useMemo(
    () => (racesQuery.data ? mergeReplacedRaceColumns(orderSeasonRaces(racesQuery.data, (r) => r.id)) : []),
    [racesQuery.data],
  );

  return (
    <PageShell title="Standings">
      {userLoading || (enabled && isPending && !firstError) ? (
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs tracking-widest uppercase">Loading</span>
        </div>
      ) : !activeLeagueId ? (
        <p className="text-xs tracking-widest uppercase text-muted-foreground">No leagues yet.</p>
      ) : firstError ? (
        <QueryError error={firstError.error} onRetry={() => queries.forEach((q) => q.refetch())} />
      ) : leagueQuery.data && teamsQuery.data && standingsQuery.data ? (
        <>
        <SeasonBanner leagueId={activeLeagueId} />
        {standingsQuery.data.finalePending && !standingsQuery.data.finaleHidden && (
          <p className="rounded-md border border-primary/40 bg-primary/10 p-3 text-xs text-muted-foreground">
            Players can&apos;t see the final standings yet. Grade everything, then release the finale from the Season page. It opens once the admins release too.
          </p>
        )}
        {user && !standingsQuery.data.finalePending && <FinaleLauncher leagueId={activeLeagueId} userId={user.id} />}
        {standingsQuery.data.finaleHidden ? (
          <FinalePendingSplash />
        ) : (
        <StandingsGrid
          league={leagueQuery.data}
          races={sortedRaces}
          usersById={standingsQuery.data.usersById}
          teams={teamsQuery.data}
          driverRows={standingsQuery.data.driverRows}
          constructorRows={standingsQuery.data.constructorRows}
          stages={standingsQuery.data.stages}
        />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" asChild>
            <Link href="/standings/history">
              <HistoryIcon className="w-4 h-4 mr-1" />
              League history
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/standings/rules">
              <ScrollTextIcon className="w-4 h-4 mr-1" />
              League rules
            </Link>
          </Button>
        </div>
        </>
      ) : null}
    </PageShell>
  );
}
