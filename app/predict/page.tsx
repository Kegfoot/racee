"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useUser } from "@/app/context/UserContext";
import { useLeague } from "@/app/context/LeagueContext";
import { orpc } from "@/lib/orpc/client";
import { RequireUser } from "@/components/RequireUser";
import { PredictionForm } from "./PredictionForm";
import { TeammateSelector } from "./teammate-lineup/TeammateSelector";
import { useTeammateSelector } from "./teammate-lineup/hooks/useTeammateSelector";
import { RaceSelector } from "@/components/prediction/RaceSelector";
import { PageShell } from "@/components/ui/page-shell";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { FlagIcon } from "lucide-react";
import type { RacePredictionDTO } from "@/server/queries/shared/race-prediction-dto";

type OpenRace = RacePredictionDTO;

function PredictPagePlaceholder() {
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <div className="h-14 w-24 rounded-sm bg-subtle" />
        <div className="h-14 w-28 rounded-sm bg-subtle" />
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-20 rounded-sm bg-subtle" />
        <div className="h-7 w-44 rounded-sm bg-subtle" />
      </div>
      <Separator />
      <div className="space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-11 rounded-sm bg-subtle" />
        ))}
      </div>
      <Separator />
      <div>
        <div className="h-2.5 w-16 rounded-sm bg-subtle mb-3" />
        <div className="border border-border rounded-sm overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={cn("h-14 flex items-center px-4", i < 6 && "border-b border-border")}>
              <div className="h-2.5 w-32 rounded-sm bg-subtle" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// The next upcoming open race, if any. This is the "still accepting
// predictions" landmark used both as the default selection (via
// autoSelectRace) and as a persistent outline on the race chip, independent
// of whatever race is currently selected.
function nextOpenRace(openRaces: OpenRace[]): string | null {
  const today = new Date().toISOString().split("T")[0];
  return openRaces.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]?.id ?? null;
}

// Prefers the next upcoming open race (unchanged from the original
// open-races-only behavior); falls back to the most recent past race by
// date only when there are no open races at all.
function autoSelectRace(openRaces: OpenRace[], pastRaces: OpenRace[]): string | null {
  return (
    nextOpenRace(openRaces) ??
    [...openRaces].sort((a, b) => b.date.localeCompare(a.date))[0]?.id ??
    [...pastRaces].sort((a, b) => b.date.localeCompare(a.date))[0]?.id ??
    null
  );
}

export default function PredictPage() {
  const { user } = useUser();
  const { activeLeagueId } = useLeague();
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);

  const openRacesQuery = useQuery(
    orpc.predictions.openRaces.queryOptions({
      input: { leagueId: activeLeagueId ?? "" },
      enabled: !!user && !!activeLeagueId,
    }),
  );
  const pastRacesQuery = useQuery(
    orpc.predictions.pastRaces.queryOptions({
      input: { leagueId: activeLeagueId ?? "" },
      enabled: !!user && !!activeLeagueId,
    }),
  );
  const data = openRacesQuery.data;
  const pastData = pastRacesQuery.data;
  const seasonBets = useQuery(
    orpc.seasonProps.get.queryOptions({ input: { leagueId: activeLeagueId ?? "" }, enabled: !!user && !!activeLeagueId }),
  ).data;
  const seasonBetsOpen = !!seasonBets?.enabled && !!seasonBets.open;

  const { displayName, isProxy, selectedPlayerId, next, prev } =
    useTeammateSelector(data?.teammates ?? []);

  const openRaces = data?.openRaces ?? [];
  const pastRaces = pastData?.pastRaces ?? [];
  const allRaces = [...openRaces, ...pastRaces];
  const sortedRaces = [...allRaces].sort((a, b) => a.date.localeCompare(b.date));
  const racersById = { ...(data?.racersById ?? {}), ...(pastData?.racersById ?? {}) };

  // Derived, not stored: keeps the explicit selection when it's still present
  // in a refreshed result (e.g. after a submit invalidates this query),
  // otherwise falls back to auto-selecting the next relevant race. No effect
  // needed since this is a pure function of `openRaces`/`pastRaces` + `selectedRaceId`.
  const effectiveRaceId =
    selectedRaceId && allRaces.some((r) => r.id === selectedRaceId)
      ? selectedRaceId
      : autoSelectRace(openRaces, pastRaces);
  const selectedRace = allRaces.find((r) => r.id === effectiveRaceId) ?? null;
  const nextOpenRaceId = nextOpenRace(openRaces);

  const activePick = (() => {
    if (!selectedRace || !data) return null;
    if (selectedPlayerId) {
      // Open races' teammate picks come with openRaces; locked races' with pastRaces.
      return (
        data.teammatePicks[selectedRace.id]?.[selectedPlayerId] ??
        pastData?.teammatePicks[selectedRace.id]?.[selectedPlayerId] ??
        null
      );
    }
    return selectedRace.myPick;
  })();

  const resolvedSubmittedByName = activePick?.submittedBy
    ? (activePick.submittedByName ?? "You")
    : null;

  return (
    <PageShell title="Predict">
      <RequireUser>
        {!data || !pastData ? (
          <PredictPagePlaceholder />
        ) : (
          <div className="space-y-5">
            {seasonBetsOpen && seasonBets?.canPick && Object.keys(seasonBets.myPicks).length < seasonBets.questions.length ? (
              <Link
                href="/predict/season"
                className="block rounded-lg border border-primary/50 bg-primary/10 p-4 transition-colors hover:bg-primary/15"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">Make your season picks first</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your league is playing year-long bets. Lock in your answers before the races.
                </p>
              </Link>
            ) : (
              seasonBetsOpen && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/predict/season">Season picks{seasonBets?.canPick && " (open)"}</Link>
                </Button>
              )
            )}

            <RaceSelector
              races={sortedRaces}
              selectedRaceId={effectiveRaceId}
              onSelect={setSelectedRaceId}
              autoScrollToSelected
              nextOpenRaceId={nextOpenRaceId}
            />

            {data.teammates.length > 0 && (
              <TeammateSelector
                userId={selectedPlayerId ?? user?.id}
                displayName={displayName}
                avatarName={selectedPlayerId ? displayName : (user?.name ?? displayName)}
                isProxy={isProxy}
                teamColor={data.teamColor}
                onNext={next}
                onPrev={prev}
              />
            )}

            {selectedRace ? (
              <PredictionForm
                key={`${activeLeagueId}_${selectedRace.id}_${selectedPlayerId ?? user?.id}`}
                race={selectedRace}
                leagueId={activeLeagueId!}
                racersById={racersById}
                existingPrediction={activePick?.racerIds ?? null}
                existingSubmittedAt={activePick?.submittedAt ?? null}
                existingPropPicks={activePick?.propPicks ?? {}}
                existingSubmittedByName={resolvedSubmittedByName}
                keyIsSet={selectedRace.keyIsSet}
                isProxy={isProxy}
                targetUserId={selectedPlayerId ?? user?.id}
                targetUserName={displayName}
                teamColor={data.teamColor}
              />
            ) : (
              <div className="flex flex-col items-center text-center pt-12 gap-4">
                <FlagIcon className="size-12 text-text-tertiary" strokeWidth={1.5} />
                <div className="space-y-1">
                  <p className="font-heading text-[1.75rem] font-bold text-foreground">No Active Race</p>
                  <p className="text-sm font-mono text-muted-foreground">No races are scheduled for this league yet.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </RequireUser>
    </PageShell>
  );
}
