import type { SeasonRecord } from "@/server/domain/league-history";

/**
 * The season finale's extra awards, worked out from a season record (plus each
 * player's weekly prop accuracy). Pure functions: nothing here loads anything.
 */

export type FinaleAwardWinner = { id: string; name: string; value: string };

export type FinaleAward = {
  id: "highScore" | "mostMedals" | "highestAverage" | "consistent" | "propWizard" | "traveler" | "hotStreak";
  title: string;
  blurb: string;
  winners: FinaleAwardWinner[];
};

export type PropAccuracy = { correct: number; total: number };

const MAX_WINNERS = 3;
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

type PlayerRow = SeasonRecord["players"][number];

/** Race columns that were actually scored for someone, in season order. */
function scoredRaceIds(record: SeasonRecord): string[] {
  const scored = new Set(record.players.flatMap((p) => Object.keys(p.raceScores)));
  return record.races.filter((r) => !r.cancelled && scored.has(r.raceId)).map((r) => r.raceId);
}

function withUserId(players: readonly PlayerRow[]) {
  return players.filter((p): p is PlayerRow & { userId: string } => p.userId !== null);
}

/** The best single race of the season: the highest score anyone put up in one race. */
export function highestScoredRace(record: SeasonRecord): FinaleAward | null {
  const labelOf = new Map(record.races.map((r) => [r.raceId, r.label]));
  let best = 0;
  let winners: { p: PlayerRow & { userId: string }; raceId: string }[] = [];
  for (const p of withUserId(record.players)) {
    for (const [raceId, points] of Object.entries(p.raceScores)) {
      if (points > best) {
        best = points;
        winners = [{ p, raceId }];
      } else if (points === best && points > 0) winners.push({ p, raceId });
    }
  }
  if (best <= 0 || winners.length === 0) return null;
  return {
    id: "highScore",
    title: "Highest-Scoring Race",
    blurb: "The biggest single-race score of the season",
    winners: winners.slice(0, MAX_WINNERS).map(({ p, raceId }) => ({
      id: p.userId,
      name: p.name,
      value: `${fmt(best)} pts · ${labelOf.get(raceId) ?? "a race"}`,
    })),
  };
}

/** Most consistent: the smallest spread between a player's race scores (players who scored most of the season only). */
export function mostConsistent(record: SeasonRecord): FinaleAward | null {
  const players = withUserId(record.players);
  const mostRaces = Math.max(0, ...players.map((p) => Object.keys(p.raceScores).length));
  const minRaces = Math.max(3, Math.ceil(mostRaces * 0.6));
  const rows = players
    .filter((p) => Object.keys(p.raceScores).length >= minRaces)
    .map((p) => {
      const values = Object.values(p.raceScores);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
      return { p, mean, sd };
    });
  if (rows.length === 0) return null;
  const best = Math.min(...rows.map((r) => r.sd));
  const winners = rows.filter((r) => Math.abs(r.sd - best) < 1e-9);
  return {
    id: "consistent",
    title: "Most Consistent",
    blurb: "The smallest swing between their best and worst weeks",
    winners: winners.slice(0, MAX_WINNERS).map((r) => ({ id: r.p.userId, name: r.p.name, value: `averaged ${fmt(r.mean)} pts, only ±${fmt(r.sd)}` })),
  };
}

/** Most medals: the most race podiums (gold, silver and bronze together), golds breaking ties. */
export function mostMedals(record: SeasonRecord): FinaleAward | null {
  const rows = withUserId(record.players).map((p) => ({ p, total: p.medals.gold + p.medals.silver + p.medals.bronze }));
  const best = Math.max(0, ...rows.map((r) => r.total));
  if (best === 0) return null;
  const top = rows.filter((r) => r.total === best);
  const mostGold = Math.max(...top.map((r) => r.p.medals.gold));
  return {
    id: "mostMedals",
    title: "Most Medals",
    blurb: "The most race podiums of the season",
    winners: top
      .filter((r) => r.p.medals.gold === mostGold)
      .slice(0, MAX_WINNERS)
      .map((r) => ({
        id: r.p.userId,
        name: r.p.name,
        value: `${best} medal${best === 1 ? "" : "s"} · ${r.p.medals.gold} gold`,
      })),
  };
}

/** Highest average: the best points per race (players who scored most of the season only). */
export function highestAverage(record: SeasonRecord): FinaleAward | null {
  const players = withUserId(record.players);
  const mostRaces = Math.max(0, ...players.map((p) => Object.keys(p.raceScores).length));
  const minRaces = Math.max(3, Math.ceil(mostRaces * 0.6));
  const rows = players
    .filter((p) => Object.keys(p.raceScores).length >= minRaces)
    .map((p) => {
      const values = Object.values(p.raceScores);
      return { p, mean: values.reduce((a, b) => a + b, 0) / values.length };
    });
  if (rows.length === 0) return null;
  const best = Math.max(...rows.map((r) => r.mean));
  return {
    id: "highestAverage",
    title: "Highest Average",
    blurb: "The most points per race, week in and week out",
    winners: rows
      .filter((r) => Math.abs(r.mean - best) < 1e-9)
      .slice(0, MAX_WINNERS)
      .map((r) => ({ id: r.p.userId, name: r.p.name, value: `${fmt(r.mean)} pts per race` })),
  };
}

/** Prop Wizard: the best weekly prop accuracy (needs at least 10 props called). */
export function propWizard(record: SeasonRecord, accuracy: ReadonlyMap<string, PropAccuracy>): FinaleAward | null {
  const names = new Map(withUserId(record.players).map((p) => [p.userId, p.name]));
  const rows = [...accuracy]
    .filter(([id, a]) => names.has(id) && a.total >= 10)
    .map(([id, a]) => ({ id, ...a, rate: a.correct / a.total }));
  if (rows.length === 0) return null;
  const best = Math.max(...rows.map((r) => r.rate));
  if (best <= 0) return null;
  const winners = rows.filter((r) => Math.abs(r.rate - best) < 1e-9);
  return {
    id: "propWizard",
    title: "Prop Wizard",
    blurb: "The best at calling the weekly props",
    winners: winners
      .sort((a, b) => b.total - a.total)
      .slice(0, MAX_WINNERS)
      .map((r) => ({ id: r.id, name: names.get(r.id) ?? "Unknown player", value: `${Math.round(r.rate * 100)}% · ${r.correct} of ${r.total}` })),
  };
}

/** The Traveler: moved around the standings the most, race after race. */
export function traveler(record: SeasonRecord): FinaleAward | null {
  const players = withUserId(record.players).filter((p) => Object.keys(p.raceScores).length > 0);
  const raceIds = scoredRaceIds(record);
  if (players.length < 2 || raceIds.length < 2) return null;

  const running = new Map(players.map((p) => [p.userId, 0]));
  let previous = new Map<string, number>();
  const moved = new Map(players.map((p) => [p.userId, 0]));
  raceIds.forEach((raceId, i) => {
    for (const p of players) running.set(p.userId, (running.get(p.userId) ?? 0) + (p.raceScores[raceId] ?? 0));
    const positions = new Map(
      players.map((p) => [p.userId, 1 + players.filter((o) => (running.get(o.userId) ?? 0) > (running.get(p.userId) ?? 0)).length]),
    );
    if (i > 0) for (const p of players) moved.set(p.userId, (moved.get(p.userId) ?? 0) + Math.abs((positions.get(p.userId) ?? 0) - (previous.get(p.userId) ?? 0)));
    previous = positions;
  });

  const best = Math.max(...moved.values());
  if (best < 3) return null;
  const winners = players.filter((p) => moved.get(p.userId) === best);
  return {
    id: "traveler",
    title: "The Traveler",
    blurb: "Changed places in the standings more than anyone",
    winners: winners.slice(0, MAX_WINNERS).map((p) => ({ id: p.userId, name: p.name, value: `${best} places moved` })),
  };
}

/** Hot Streak: the longest run of race podiums (a medal) in a row. */
export function hotStreak(record: SeasonRecord): FinaleAward | null {
  const raceIds = scoredRaceIds(record);
  const rows = withUserId(record.players).map((p) => {
    const medalRaces = new Set(p.medalDetails.map((m) => m.raceId));
    let run = 0;
    let longest = 0;
    for (const raceId of raceIds) {
      run = medalRaces.has(raceId) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    return { p, longest };
  });
  const best = Math.max(0, ...rows.map((r) => r.longest));
  if (best < 2) return null;
  return {
    id: "hotStreak",
    title: "Hot Streak",
    blurb: "The longest run of podium finishes in a row",
    winners: rows
      .filter((r) => r.longest === best)
      .slice(0, MAX_WINNERS)
      .map((r) => ({ id: r.p.userId, name: r.p.name, value: `${best} podiums in a row` })),
  };
}

export function computeFinaleAwards(record: SeasonRecord, accuracy: ReadonlyMap<string, PropAccuracy>): FinaleAward[] {
  return [highestScoredRace(record), mostMedals(record), highestAverage(record), mostConsistent(record), propWizard(record, accuracy), traveler(record), hotStreak(record)].filter(
    (a): a is FinaleAward => a !== null,
  );
}
