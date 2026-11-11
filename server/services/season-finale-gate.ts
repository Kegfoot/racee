import type { Race } from "@/server/domain/race";

/**
 * The finale gate. Once the season's last race has started, the final standings
 * are hidden from players ("pending") until BOTH the site admins (who grade the
 * races and the year-long questions) and the league's commissioner have
 * released the finale.
 */
export type FinalePhase = "none" | "pending" | "released";

/** Has the season's last counted race started? Races without a lock time start at the beginning of their day. */
export function lastRaceStarted(seasonRaces: readonly Race[], now: Date): boolean {
  const counted = seasonRaces.filter(r => !r.cancelled);
  if (counted.length === 0) return false;
  const last = counted.reduce((a, b) => (b.date > a.date ? b : a));
  const start = last.lockTime ? new Date(last.lockTime) : new Date(`${last.date.slice(0, 10)}T00:00:00Z`);
  return now >= start;
}

export function finalePhase(args: {
  lastRaceStarted: boolean;
  seasonEnded: boolean;
  commissionerReleased: boolean;
  adminReleased: boolean;
}): FinalePhase {
  if (!args.lastRaceStarted && !args.seasonEnded) return "none";
  return args.commissionerReleased && args.adminReleased ? "released" : "pending";
}
