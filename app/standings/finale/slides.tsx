"use client";

import { motion } from "motion/react";
import { LeaguePlayerAvatar } from "@/components/avatar/LeaguePlayerAvatar";
import { TeamLogo } from "@/components/avatar/TeamLogo";
import type { AvatarSize } from "@/components/avatar/PlayerAvatar";
import { MedalIcon, TrophyIcon } from "@/components/trophies/AwardIcons";
import { medalForRank, type Medal } from "@/lib/medals";
import { formatPoints } from "@/lib/utils";
import type { FinaleAward } from "@/server/services/season-finale";
import type { FinaleMedalRow, FinaleStandingRow } from "@/server/queries/league-finale/ILeagueFinaleQuery";

type Logo = { id: string; name: string; color: string | null; logo: string | null };

const label = "font-mono text-xs uppercase tracking-[0.2em] text-white/50";
const rise = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.15 + i * 0.18, duration: 0.5, ease: [0.25, 1, 0.5, 1] as [number, number, number, number] },
});

function Identity({ id, name, size, leagueId, logos }: { id: string; name: string; size: AvatarSize; leagueId: string; logos?: Logo[] }) {
  const team = logos?.find((t) => t.id === id);
  if (logos) {
    if (!team) return null;
    return <TeamLogo leagueId={leagueId} teamId={team.id} name={team.name} color={team.color} logo={team.logo} size={size} />;
  }
  return <LeaguePlayerAvatar userId={id} name={name} leagueId={leagueId} size={size} action="none" />;
}

/** Splash that opens the finale. */
export function IntroSlide({ leagueName, seasonLabel }: { leagueName: string; seasonLabel: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <motion.p {...rise(0)} className={label}>
        {leagueName}
      </motion.p>
      <motion.h1 {...rise(1)} className="font-mono text-4xl font-bold uppercase tracking-[0.12em] text-white sm:text-6xl">
        {seasonLabel} finale
      </motion.h1>
      <motion.p {...rise(2)} className="max-w-sm text-sm text-white/60">
        The final results are in. Let&apos;s see who took home the hardware.
      </motion.p>
    </div>
  );
}

/** The trophy winners of one cup, with the trophies they earned. */
export function TrophySlide({
  title,
  rows,
  leagueId,
  logos,
}: {
  title: string;
  rows: FinaleStandingRow[];
  leagueId: string;
  logos?: Logo[];
}) {
  const podium = rows.filter((r) => r.rank <= 3).sort((a, b) => a.rank - b.rank);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 text-center">
      <motion.p {...rise(0)} className={label}>
        {title}
      </motion.p>
      <div className="flex flex-wrap items-end justify-center gap-x-8 gap-y-6">
        {podium.map((r, i) => {
          const trophy = medalForRank(r.rank, r.total);
          return (
            <motion.div key={r.id} {...rise(i + 1)} className="flex w-32 flex-col items-center gap-2 sm:w-40">
              {trophy && <TrophyIcon medal={trophy} className={r.rank === 1 ? "size-24 sm:size-28" : "size-16 sm:size-20"} />}
              <Identity id={r.id} name={r.name} size="xl" leagueId={leagueId} logos={logos} />
              <p className="max-w-full truncate font-mono text-sm font-semibold uppercase tracking-wide text-white">{r.name}</p>
              <p className="font-mono text-lg font-bold tabular-nums text-white">{formatPoints(r.total)}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                {r.rank === 1 ? "1st" : r.rank === 2 ? "2nd" : "3rd"}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function MedalCount({ medal, n }: { medal: Medal; n: number }) {
  return (
    <span className={n === 0 ? "inline-flex items-center gap-1 opacity-30" : "inline-flex items-center gap-1"}>
      <MedalIcon medal={medal} className="size-5" />
      <span className="w-5 text-left font-mono text-sm font-semibold tabular-nums text-white">{n}</span>
    </span>
  );
}

function MedalList({ title, rows, leagueId, logos }: { title: string; rows: FinaleMedalRow[]; leagueId: string; logos?: Logo[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="w-full space-y-2">
      <p className={label}>{title}</p>
      <div className="space-y-1.5">
        {rows.slice(0, 8).map((r, i) => (
          <motion.div key={r.id} {...rise(i * 0.4)} className="flex items-center gap-3 rounded-sm border border-white/10 px-3 py-1.5">
            <Identity id={r.id} name={r.name} size="md" leagueId={leagueId} logos={logos} />
            <span className="min-w-0 flex-1 truncate text-left font-mono text-sm uppercase tracking-wide text-white">{r.name}</span>
            <MedalCount medal="gold" n={r.gold} />
            <MedalCount medal="silver" n={r.silver} />
            <MedalCount medal="bronze" n={r.bronze} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Race medals: who won (and podiumed) the most races. */
export function MedalsSlide({
  players,
  teams,
  leagueId,
  logos,
}: {
  players: FinaleMedalRow[];
  teams: FinaleMedalRow[];
  leagueId: string;
  logos: Logo[];
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-16 text-center">
      <motion.h2 {...rise(0)} className="font-mono text-2xl font-bold uppercase tracking-[0.15em] text-white">
        Race medals
      </motion.h2>
      <p className="-mt-3 text-xs text-white/50">Gold for winning a race, silver and bronze for 2nd and 3rd.</p>
      <MedalList title="Drivers" rows={players} leagueId={leagueId} />
      <MedalList title="Constructors" rows={teams} leagueId={leagueId} logos={logos} />
    </div>
  );
}

/** One of the extra awards. */
export function AwardSlide({ award, leagueId }: { award: FinaleAward; leagueId: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <motion.p {...rise(0)} className={label}>
        Season award
      </motion.p>
      <motion.h2 {...rise(1)} className="font-mono text-3xl font-bold uppercase tracking-[0.12em] text-amber-300 sm:text-5xl">
        {award.title}
      </motion.h2>
      <motion.p {...rise(2)} className="max-w-xs text-sm text-white/60">
        {award.blurb}
      </motion.p>
      <div className="flex flex-wrap justify-center gap-6">
        {award.winners.map((w, i) => (
          <motion.div key={w.id} {...rise(3 + i)} className="flex max-w-[14rem] flex-col items-center gap-2">
            <LeaguePlayerAvatar userId={w.id} name={w.name} leagueId={leagueId} size="xl" action="none" />
            <p className="font-mono text-lg font-semibold uppercase tracking-wide text-white">{w.name}</p>
            <p className="text-xs text-white/60">{w.value}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Last slide. */
export function OutroSlide({ seasonLabel }: { seasonLabel: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <motion.h2 {...rise(0)} className="font-mono text-3xl font-bold uppercase tracking-[0.12em] text-white">
        That&apos;s the {seasonLabel} season
      </motion.h2>
      <motion.p {...rise(1)} className="text-sm text-white/60">
        Congratulations to everyone, and thanks for racing.
      </motion.p>
    </div>
  );
}
