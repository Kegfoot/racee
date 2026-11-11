"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useUser } from "@/app/context/UserContext";
import { orpc } from "@/lib/orpc/client";
import { SeasonFinale } from "@/app/standings/finale/SeasonFinale";

/** Commissioner's finale controls: what is left to grade, release, and a private preview. */
export function FinaleCard({
  leagueId,
  ended,
  unscoredRaces,
  onError,
}: {
  leagueId: string;
  ended: boolean;
  unscoredRaces: number;
  onError: (message: string) => void;
}) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const propsQuery = useQuery(orpc.seasonProps.get.queryOptions({ input: { leagueId } }));
  const [watching, setWatching] = useState(false);
  const previewQuery = useQuery(orpc.seasonProps.finale.get.queryOptions({ input: { leagueId, preview: true }, enabled: watching }));

  const release = useMutation(
    orpc.seasonProps.releaseFinale.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.seasonProps.key() });
        queryClient.invalidateQueries({ queryKey: orpc.standings.key() });
      },
      onError: (e) => onError(e instanceof Error && e.message ? e.message : "Couldn't release the finale."),
    }),
  );

  const p = propsQuery.data;
  const betsOn = !!p?.enabled && p.open;
  const open = p?.questions.filter((q) => q.answerState === "pending") ?? [];
  const blocked = betsOn && open.length > 0;
  const released = !!p?.finaleReleased;

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Season finale</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {ended ? (
            <>
              <p className="text-xs text-muted-foreground">
                Players see &ldquo;Final results: Pending&rdquo; instead of the standings until you release the finale. Grade
                everything first, then release.
              </p>
              <ul className="space-y-1 text-sm">
                <li className="flex items-center gap-2">
                  {unscoredRaces === 0 ? <CheckIcon className="size-4 text-green-500" /> : <CircleIcon className="size-4 text-muted-foreground" />}
                  {unscoredRaces === 0 ? "Every race is graded" : `${unscoredRaces} race${unscoredRaces === 1 ? "" : "s"} not graded (optional)`}
                </li>
                {betsOn && (
                  <li className="flex items-center gap-2">
                    {open.length === 0 ? <CheckIcon className="size-4 text-green-500" /> : <CircleIcon className="size-4 text-amber-500" />}
                    {open.length === 0 ? "Every season bet is answered" : `${open.length} season bet${open.length === 1 ? "" : "s"} still need an answer`}
                  </li>
                )}
              </ul>
              {blocked && (
                <p className="text-xs text-muted-foreground">Answer (or void) them on the Season bets page to unlock the release.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => release.mutate({ leagueId })} disabled={release.isPending || blocked || propsQuery.isPending}>
                  {release.isPending && <Spinner className="w-3 h-3 mr-1" />}
                  {released ? "Release again" : "Release finale"}
                </Button>
                <Button variant="outline" onClick={() => setWatching(true)}>
                  {released ? "Watch the finale" : "Preview the finale"}
                </Button>
              </div>
              {released && <p className="text-xs text-green-600">Released. Players can watch it now.</p>}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Once you end the season you can release a full finale video. Want a peek at how it looks now?
              </p>
              <Button variant="outline" onClick={() => setWatching(true)}>
                Preview the finale
              </Button>
            </>
          )}
          {watching && previewQuery.isPending && <p className="text-xs text-muted-foreground">Loading…</p>}
        </CardContent>
      </Card>
      {watching && previewQuery.data && (
        <SeasonFinale data={previewQuery.data} viewerId={user?.id ?? null} onClose={() => setWatching(false)} />
      )}
    </>
  );
}
