"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/finale/Confetti";
import { CutscenePlayer, type CutscenePlayerHandle, type CutscenePlayerProgress } from "@/app/results/cutscene/CutscenePlayer";
import type { CutsceneData } from "@/app/results/cutscene/beats";
import type { LeagueFinaleResult } from "@/server/queries/league-finale/ILeagueFinaleQuery";
import { AwardSlide, IntroSlide, MedalsSlide, OutroSlide, TrophySlide } from "./slides";

/** Auto-advance time for the slides between the videos. */
const SLIDE_MS = 7000;

type Act =
  | { kind: "intro" }
  | { kind: "driversVideo" }
  | { kind: "driversTrophies" }
  | { kind: "teamsVideo" }
  | { kind: "teamsTrophies" }
  | { kind: "medals" }
  | { kind: "award"; index: number }
  | { kind: "outro" };

/**
 * The season finale, in the same style as the race reveal: the Drivers' Cup
 * countdown and podium, a trophy-and-confetti moment, the same for the
 * Constructors' Cup, then race medals and the extra awards. Full screen over
 * the page; `onClose` fires when it ends or is skipped.
 */
export function SeasonFinale({ data, viewerId, onClose }: { data: LeagueFinaleResult; viewerId: string | null; onClose: () => void }) {
  const hasTeams = data.teams.length > 0;
  const hasMedals = data.medals.players.length > 0 || data.medals.teams.length > 0;

  const acts = useMemo<Act[]>(
    () => [
      { kind: "intro" },
      { kind: "driversVideo" },
      { kind: "driversTrophies" },
      ...(hasTeams ? ([{ kind: "teamsVideo" }, { kind: "teamsTrophies" }] as Act[]) : []),
      ...(hasMedals ? ([{ kind: "medals" }] as Act[]) : []),
      ...data.awards.map((_, index) => ({ kind: "award", index }) as Act),
      { kind: "outro" },
    ],
    [hasTeams, hasMedals, data.awards],
  );

  const [step, setStep] = useState(0);
  const act = acts[step];
  const driversRef = useRef<CutscenePlayerHandle>(null);
  const teamsRef = useRef<CutscenePlayerHandle>(null);
  // Remember which videos finished, so a late progress callback can't advance twice.
  const finished = useRef({ drivers: false, teams: false });

  const driversData = useMemo<CutsceneData>(
    () => ({
      entries: data.drivers.map((r) => ({ userId: r.id, name: r.name, total: r.total, rank: r.rank, color: r.color, teamName: r.subtitle })),
      raceName: `${data.seasonLabel} season`,
      leagueName: `${data.leagueName} · Drivers' Cup`,
      currentUserId: viewerId,
    }),
    [data, viewerId],
  );
  const teamsData = useMemo<CutsceneData>(
    () => ({
      entries: data.teams.map((r) => ({ userId: r.id, name: r.name, total: r.total, rank: r.rank, color: r.color, teamName: r.subtitle })),
      raceName: `${data.seasonLabel} season`,
      leagueName: `${data.leagueName} · Constructors' Cup`,
      currentUserId: data.viewerTeamId,
      mode: "constructors",
      leagueId: data.leagueId,
      teams: data.teamLogos,
    }),
    [data],
  );

  const next = () => setStep((s) => Math.min(s + 1, acts.length - 1));

  // Entering a video act starts that video.
  useEffect(() => {
    if (act.kind === "driversVideo") driversRef.current?.play();
    if (act.kind === "teamsVideo") teamsRef.current?.play();
  }, [act.kind]);

  // The slides between videos move on by themselves.
  useEffect(() => {
    if (act.kind === "driversVideo" || act.kind === "teamsVideo" || act.kind === "outro") return;
    const t = setTimeout(next, act.kind === "intro" ? 3500 : SLIDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const onDriversProgress = (p: CutscenePlayerProgress) => {
    if (p.isComplete && !finished.current.drivers) {
      finished.current.drivers = true;
      setStep((s) => (acts[s]?.kind === "driversVideo" ? s + 1 : s));
    }
  };
  const onTeamsProgress = (p: CutscenePlayerProgress) => {
    if (p.isComplete && !finished.current.teams) {
      finished.current.teams = true;
      setStep((s) => (acts[s]?.kind === "teamsVideo" ? s + 1 : s));
    }
  };

  const isVideo = act.kind === "driversVideo" || act.kind === "teamsVideo";
  // While a video plays, the slide that follows it waits underneath (the video lifts away to reveal it).
  const showing: Act = act.kind === "driversVideo" ? { kind: "driversTrophies" } : act.kind === "teamsVideo" ? { kind: "teamsTrophies" } : act;

  return (
    <div className="fixed inset-0 z-40 bg-black text-white" role="dialog" aria-label="Season finale">
      <div className="h-full" key={showing.kind + (showing.kind === "award" ? showing.index : "")}>
        {showing.kind === "intro" && <IntroSlide leagueName={data.leagueName} seasonLabel={data.seasonLabel} />}
        {showing.kind === "driversTrophies" && (
          <TrophySlide title="Drivers' Cup" rows={data.drivers} leagueId={data.leagueId} />
        )}
        {showing.kind === "teamsTrophies" && (
          <TrophySlide title="Constructors' Cup" rows={data.teams} leagueId={data.leagueId} logos={data.teamLogos} />
        )}
        {showing.kind === "medals" && (
          <MedalsSlide players={data.medals.players} teams={data.medals.teams} leagueId={data.leagueId} logos={data.teamLogos} />
        )}
        {showing.kind === "award" && <AwardSlide award={data.awards[showing.index]} leagueId={data.leagueId} />}
        {showing.kind === "outro" && <OutroSlide seasonLabel={data.seasonLabel} />}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-xs uppercase tracking-widest text-white/50 transition-colors hover:text-white"
        >
          {act.kind === "outro" ? "" : "Skip all"}
        </button>
        {act.kind === "outro" ? (
          <Button onClick={onClose}>Back to the standings</Button>
        ) : (
          !isVideo && (
            <button
              type="button"
              onClick={next}
              className="font-mono text-xs uppercase tracking-widest text-white/50 transition-colors hover:text-white"
            >
              Next
            </button>
          )
        )}
      </div>

      <CutscenePlayer ref={driversRef} data={driversData} onProgress={onDriversProgress} />
      {hasTeams && <CutscenePlayer ref={teamsRef} data={teamsData} onProgress={onTeamsProgress} />}
      <Confetti fireKey={act.kind === "driversTrophies" || act.kind === "teamsTrophies" ? step + 1 : 0} />
    </div>
  );
}
