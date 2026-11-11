"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { orpc } from "@/lib/orpc/client";
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
import { PendingSection } from "./PendingSection";
import { MembersSection } from "./MembersSection";

type PlayersListProps = {
  leagueId: string;
};

export function PlayersList({ leagueId }: PlayersListProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const input = { leagueId };

  const playersQuery = useQuery(orpc.leagues.players.list.queryOptions({ input }));

  const invalidatePlayers = () => {
    queryClient.invalidateQueries({ queryKey: orpc.leagues.players.list.key({ input }) });
    queryClient.invalidateQueries({ queryKey: orpc.leagues.avatars.list.key({ input }) });
  };
  const seasonBets = useQuery(orpc.seasonProps.get.queryOptions({ input })).data;
  const [latePick, setLatePick] = useState<{ userId: string; name: string } | null>(null);
  const allowLate = useMutation(
    orpc.seasonProps.allowLatePicker.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.seasonProps.key() }),
    }),
  );
  const acceptMutation = useMutation(
    orpc.leagues.players.accept.mutationOptions({
      onSuccess: (_data, variables) => {
        invalidatePlayers();
        // Season bets are already locked: the commissioner decides if the newcomer may still pick.
        if (seasonBets?.enabled && seasonBets.open && seasonBets.locked) {
          const name = playersQuery.data?.pending.find((p) => p.id === variables.userId)?.name ?? "this player";
          setLatePick({ userId: variables.userId, name });
        }
      },
    }),
  );
  const denyMutation = useMutation(
    orpc.leagues.players.deny.mutationOptions({ onSuccess: invalidatePlayers }),
  );
  const removeMutation = useMutation(
    orpc.leagues.players.remove.mutationOptions({
      onSuccess: (_data, variables) => {
        // The commissioner just handed the league over and left — they no longer have access here.
        if (variables.newCommissionerId) {
          router.push("/");
          return;
        }
        // Removal also strips the user from their team and shrinks the member
        // roster, so the co-commissioner and team-management views must refetch.
        invalidatePlayers();
        queryClient.invalidateQueries({ queryKey: orpc.leagues.members.list.key({ input }) });
        queryClient.invalidateQueries({ queryKey: orpc.leagues.teams.roster.key({ input }) });
        queryClient.invalidateQueries({ queryKey: orpc.standings.get.key({ input }) });
      },
    }),
  );

  if (playersQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading players...</p>;
  }

  if (playersQuery.isError) {
    return <p className="text-sm text-destructive">Failed to load players.</p>;
  }

  const { pending, members } = playersQuery.data;

  const actionPending = new Set<string>();
  for (const m of [acceptMutation, denyMutation, removeMutation]) {
    if (m.isPending && m.variables) actionPending.add(m.variables.userId);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Members
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          {removeMutation.isError && (
            <p className="px-4 pb-2 text-sm text-destructive">
              Couldn&apos;t remove that player. Only the commissioner can hand over the league.
            </p>
          )}
          <MembersSection
            leagueId={leagueId}
            members={members}
            onRemove={(id, clearScores, newCommissionerId, eraseHistory) =>
              removeMutation.mutate({ leagueId, userId: id, clearScores, newCommissionerId, eraseHistory })
            }
            actionPending={actionPending}
          />
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Pending
            </h2>
            <CardAction>
              <Badge variant="secondary">{pending.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="p-0">
            <PendingSection
              pending={pending}
              onAccept={(id) => acceptMutation.mutate({ leagueId, userId: id })}
              onDeny={(id) => denyMutation.mutate({ leagueId, userId: id })}
              actionPending={actionPending}
            />
          </CardContent>
        </Card>
      )}
      <AlertDialog open={!!latePick} onOpenChange={(o) => !o && setLatePick(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Let {latePick?.name} make season picks?</AlertDialogTitle>
            <AlertDialogDescription>
              Season bets are already locked. You can let {latePick?.name} pick anyway now that they&apos;re joining mid-season.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, skip bets</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => latePick && allowLate.mutate({ leagueId, userId: latePick.userId, allowed: true })}
            >
              Yes, let them pick
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
