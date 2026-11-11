"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { orpc } from "@/lib/orpc/client";

const Tick = ({ done }: { done: boolean }) =>
  done ? <CheckIcon className="size-4 text-green-500" /> : <CircleIcon className="size-4 text-muted-foreground" />;

/** Commissioner's half of the finale release: what is left to grade, and the release button. */
export function FinaleCard({
  leagueId,
  unscoredRaces,
  onError,
}: {
  leagueId: string;
  unscoredRaces: number;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const propsQuery = useQuery(orpc.seasonProps.get.queryOptions({ input: { leagueId } }));
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
  if (!p || !(p.lastRaceStarted || p.seasonEnded)) return null;

  const betsOn = p.enabled && p.open;
  const open = p.questions.filter((q) => q.answerState === "pending");
  const blocked = betsOn && open.length > 0;
  const released = p.finaleReleased;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Season finale</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          The last race has started, so your players see &ldquo;Final results: Pending&rdquo; instead of the standings. The
          finale opens for them once you and the site admins have both released it.
        </p>
        <ul className="space-y-1 text-sm">
          <li className="flex items-center gap-2">
            <Tick done={unscoredRaces === 0} />
            {unscoredRaces === 0 ? "Every race is graded" : `${unscoredRaces} race${unscoredRaces === 1 ? "" : "s"} not graded yet`}
          </li>
          {betsOn && (
            <li className="flex items-center gap-2">
              <Tick done={open.length === 0} />
              {open.length === 0 ? "Every season bet is answered" : `${open.length} season bet${open.length === 1 ? "" : "s"} still need an answer`}
            </li>
          )}
          <li className="flex items-center gap-2">
            <Tick done={released} />
            Your release: {released ? "done" : "waiting on you"}
          </li>
          <li className="flex items-center gap-2">
            <Tick done={p.finaleAdminReleased} />
            Admin release: {p.finaleAdminReleased ? "done" : "waiting on the admins"}
          </li>
        </ul>
        {blocked && <p className="text-xs text-muted-foreground">Answer (or void) the season bets to unlock your release.</p>}
        {released ? (
          <p className="text-xs text-green-600">
            {p.finaleAdminReleased ? "Both releases are in. Your players can watch the finale." : "Released on your end. Waiting on the admins."}
          </p>
        ) : (
          <Button onClick={() => release.mutate({ leagueId })} disabled={release.isPending || blocked}>
            {release.isPending && <Spinner className="w-3 h-3 mr-1" />}
            Release finale
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
