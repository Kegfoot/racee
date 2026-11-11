"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, TriangleAlertIcon } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { QueryError, QueryLoading } from "@/components/ui/query-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { orpc } from "@/lib/orpc/client";
import { medalForRank } from "@/lib/medals";
import { formatPoints } from "@/lib/utils";
import { TrophyIcon } from "@/components/trophies/AwardIcons";
import { FinaleCard } from "./FinaleCard";

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function CommissionerSeasonPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const queryClient = useQueryClient();
  const historyQuery = useQuery(orpc.history.get.queryOptions({ input: { leagueId } }));
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: orpc.history.key() });
    queryClient.invalidateQueries({ queryKey: orpc.leagues.key() });
    queryClient.invalidateQueries({ queryKey: orpc.standings.key() });
    queryClient.invalidateQueries({ queryKey: orpc.races.key() });
  };
  const endMutation = useMutation(
    orpc.history.endSeason.mutationOptions({ onSuccess: invalidate, onError: (e) => setError(errorMessage(e, "Couldn't end the season.")) }),
  );
  const reopenMutation = useMutation(
    orpc.history.reopenSeason.mutationOptions({ onSuccess: invalidate, onError: (e) => setError(errorMessage(e, "Couldn't reopen the season.")) }),
  );

  const undoMutation = useMutation(
    orpc.history.undoNextSeason.mutationOptions({
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: orpc.me.key() });
      },
      onError: (e) => setError(errorMessage(e, "Couldn't go back to last season.")),
    }),
  );

  const data = historyQuery.data;
  const current = data?.seasons[data.seasons.length - 1];
  const leader = current?.players.filter((p) => p.rank !== null && p.rank <= 3) ?? [];

  return (
    <PageShell title="Season">
      <Link
        href={`/commissioner/leagues/${leagueId}`}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ChevronLeft className="size-3.5" />
        {data?.leagueName ?? "League"}
      </Link>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>✕</Button>
          </AlertDescription>
        </Alert>
      )}

      {historyQuery.isPending ? (
        <QueryLoading />
      ) : historyQuery.isError ? (
        <QueryError error={historyQuery.error} onRetry={() => historyQuery.refetch()} />
      ) : data && !data.canManage ? (
        <p className="text-sm text-muted-foreground">Only commissioners can manage the season.</p>
      ) : data && current ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {data.current.label} season · {data.current.ended ? "Final" : "In progress"}
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                {data.current.scoredRaces} of {data.current.totalRaces} races scored.
              </p>
              {leader.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{data.current.ended ? "Trophy winners" : "Top 3 right now"}</p>
                  {leader.map((p) => {
                    const trophy = medalForRank(p.rank!, p.total);
                    return (
                      <div key={(p.userId ?? p.name) + p.rank} className="flex items-center gap-2 text-sm">
                        {trophy && <TrophyIcon medal={trophy} className="size-5" />}
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-muted-foreground tabular-nums">{formatPoints(p.total)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {!data.current.ended ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Ending the season locks in the final standings and hands out trophies to the top 3 players (and teams).
                    Races after the last scored race won&apos;t count. You can still fix scores afterward and the trophies
                    will follow, and you can reopen the season until you start the next one.
                  </p>
                  <Button onClick={() => setConfirmEnd(true)} disabled={endMutation.isPending || data.current.scoredRaces === 0}>
                    {endMutation.isPending && <Spinner className="w-3 h-3 mr-1" />}
                    End season
                  </Button>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => reopenMutation.mutate({ leagueId })} disabled={reopenMutation.isPending}>
                    {reopenMutation.isPending && <Spinner className="w-3 h-3 mr-1" />}
                    Reopen season
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <FinaleCard leagueId={leagueId} ended={data.current.ended} unscoredRaces={data.current.unscoredRaces} onError={setError} />

          {data.current.undoSeasonLabel && (
            <Card>
              <CardHeader>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Started the new season by mistake?
                </h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Go back to racing the {data.current.undoSeasonLabel} season with its whole calendar. Its rules, settings,
                  players and teams come back exactly as they were (any changes made for {data.current.label} are undone),
                  and its standings are rebuilt from everyone&apos;s picks.
                </p>
                <Button variant="outline" onClick={() => setConfirmUndo(true)} disabled={undoMutation.isPending}>
                  {undoMutation.isPending && <Spinner className="w-3 h-3 mr-1" />}
                  Go back to {data.current.undoSeasonLabel}
                </Button>
              </CardContent>
            </Card>
          )}

          {data.current.ended && (
            <Card>
              <CardHeader>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Next season</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Pick who&apos;s coming back, invite new players, set up teams and change any rules. Nothing changes until
                  you start the season, and the {data.current.label} season stays in the history book exactly as it ended.
                </p>
                <Button asChild>
                  <Link href={`/commissioner/leagues/${leagueId}/season/next`}>Set up the next season</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      <AlertDialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Go back to the {data?.current.undoSeasonLabel} season?</AlertDialogTitle>
            <AlertDialogDescription>
              The {data?.current.label} season is cancelled and the league goes back to racing{" "}
              {data?.current.undoSeasonLabel} with its whole calendar.
            </AlertDialogDescription>
            <div className="flex gap-2 rounded-sm border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm">
              <TriangleAlertIcon className="size-4 shrink-0 text-amber-500 mt-0.5" />
              <p>
                Any rule, scoring or team changes made for the {data?.current.label} season are undone: everything goes
                back to how it was in {data?.current.undoSeasonLabel}. Players who joined for the new season stay in.
              </p>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => undoMutation.mutate({ leagueId })}>Go back</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the {data?.current.label} season?</AlertDialogTitle>
            <AlertDialogDescription>
              Final standings lock in and trophies go to the top 3. Picks close, and everyone in the league gets a
              notification.
            </AlertDialogDescription>
            {(data?.current.unscoredRaces ?? 0) > 0 && (
              <div className="flex gap-2 rounded-sm border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm">
                <TriangleAlertIcon className="size-4 shrink-0 text-amber-500 mt-0.5" />
                <p>
                  {data!.current.unscoredRaces} race{data!.current.unscoredRaces === 1 ? " hasn't" : "s haven't"} been
                  graded yet and won&apos;t count toward the final score.
                </p>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => endMutation.mutate({ leagueId })}>End season</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
