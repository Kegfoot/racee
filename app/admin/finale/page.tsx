"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CircleIcon, ClapperboardIcon } from "lucide-react";
import { orpc } from "@/lib/orpc/client";
import { PageShell } from "@/components/ui/page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { QueryError, QueryLoading } from "@/components/ui/query-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/app/context/UserContext";
import { SeasonFinale } from "@/app/standings/finale/SeasonFinale";

const Tick = ({ done }: { done: boolean }) =>
  done ? <CheckIcon className="size-4 text-green-500" /> : <CircleIcon className="size-4 text-muted-foreground" />;

/**
 * Admin → Season finale. Once a season's last race has started, every league
 * racing it shows "Final results: Pending". Release the finale here when the
 * races and year-long questions are graded; it opens in each league once its
 * commissioner has released too. Below, watch any league's finale early.
 */
export default function AdminFinalePage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const motorsports = useQuery(orpc.motorsports.list.queryOptions());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const motorsportId = pickedId ?? motorsports.data?.[0]?.id ?? null;
  const overview = useQuery(
    orpc.seasonProps.finale.adminOverview.queryOptions({ input: { motorsportId: motorsportId ?? "" }, enabled: !!motorsportId }),
  );
  const [error, setError] = useState<string | null>(null);
  const release = useMutation(
    orpc.seasonProps.finale.adminRelease.mutationOptions({
      onSuccess: () => {
        setError(null);
        queryClient.invalidateQueries({ queryKey: orpc.seasonProps.key() });
        queryClient.invalidateQueries({ queryKey: orpc.standings.key() });
      },
      onError: (e) => setError(e instanceof Error && e.message ? e.message : "Couldn't update the release."),
    }),
  );

  const leagues = useQuery(orpc.leagues.listAll.queryOptions());
  const [leagueId, setLeagueId] = useState("");
  const [watching, setWatching] = useState(false);
  const finale = useQuery(orpc.seasonProps.finale.adminPreview.queryOptions({ input: { leagueId }, enabled: watching && !!leagueId }));

  return (
    <PageShell title="Season finale">
      <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        ← Admin
      </Link>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {motorsports.data && motorsports.data.length > 1 && (
        <Select value={motorsportId ?? ""} onValueChange={setPickedId}>
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {motorsports.data.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {overview.isPending ? (
        <QueryLoading />
      ) : overview.isError ? (
        <QueryError error={overview.error} onRetry={() => overview.refetch()} />
      ) : (
        <div className="space-y-4">
          {overview.data.seasons.length === 0 && <p className="text-sm text-muted-foreground">No seasons set up yet.</p>}
          {overview.data.seasons.map((s) => {
            const ready = s.lastRaceStarted && s.racesUngraded === 0;
            return (
              <Card key={s.seasonId}>
                <CardHeader>
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{s.label} season</h2>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1 text-sm">
                    <li className="flex items-center gap-2">
                      <Tick done={s.lastRaceStarted} />
                      {s.lastRaceStarted ? "The last race has started (leagues show Pending)" : "The last race hasn't started yet"}
                    </li>
                    <li className="flex items-center gap-2">
                      <Tick done={s.racesUngraded === 0} />
                      {s.racesUngraded === 0 ? "Every race is graded" : `${s.racesUngraded} of ${s.racesTotal} races not graded`}
                    </li>
                    <li className="flex items-center gap-2">
                      <Tick done={s.questionsUnanswered === 0} />
                      {s.questionsUnanswered === 0
                        ? "Every season question has an answer"
                        : `${s.questionsUnanswered} season question${s.questionsUnanswered === 1 ? " has" : "s have"} no answer yet`}
                    </li>
                    <li className="flex items-center gap-2">
                      <Tick done={s.leagueCount > 0 && s.leaguesReleased === s.leagueCount} />
                      {s.leaguesReleased} of {s.leagueCount} commissioners have released
                    </li>
                  </ul>
                  {s.released ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-xs text-green-600">Released. It opens in each league as its commissioner releases.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={release.isPending}
                        onClick={() => release.mutate({ motorsportId: motorsportId!, seasonId: s.seasonId, release: false })}
                      >
                        Take back
                      </Button>
                    </div>
                  ) : (
                    <Button
                      disabled={!ready || release.isPending}
                      onClick={() => release.mutate({ motorsportId: motorsportId!, seasonId: s.seasonId, release: true })}
                    >
                      {release.isPending && <Spinner className="w-3 h-3 mr-1" />}
                      Release finale for all leagues
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Preview a league&apos;s finale</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Watch any league&apos;s finale with its current standings. Nothing is released to players.</p>
          {leagues.isPending ? (
            <QueryLoading />
          ) : (
            <div className="max-w-md space-y-3">
              <Select
                value={leagueId}
                onValueChange={(v) => {
                  setLeagueId(v);
                  setWatching(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a league" />
                </SelectTrigger>
                <SelectContent>
                  {(leagues.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button disabled={!leagueId || finale.isFetching} onClick={() => setWatching(true)}>
                <ClapperboardIcon className="w-4 h-4 mr-1" />
                Watch the finale
              </Button>
              {finale.isError && <QueryError error={finale.error} onRetry={() => finale.refetch()} />}
            </div>
          )}
        </CardContent>
      </Card>
      {watching && finale.data && <SeasonFinale data={finale.data} viewerId={user?.id ?? null} onClose={() => setWatching(false)} />}
    </PageShell>
  );
}
