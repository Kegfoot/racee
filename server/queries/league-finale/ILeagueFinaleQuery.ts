import type { FinaleAward } from "@/server/services/season-finale";

export type FinaleState = "none" | "pending" | "released" | "preview";

export type FinaleStandingRow = {
  /** A player's id, or a team's id in the constructors list. */
  id: string;
  name: string;
  total: number;
  rank: number;
  color: string;
  /** Under the name: a driver's team, or a team's drivers. */
  subtitle: string;
};

export type FinaleMedalRow = { id: string; name: string; color: string; gold: number; silver: number; bronze: number };

export type LeagueFinaleResult = {
  state: FinaleState;
  leagueId: string;
  leagueName: string;
  seasonLabel: string;
  /** Changes with every season, so "already watched" can be remembered per season. */
  seasonKey: string;
  drivers: FinaleStandingRow[];
  /** Empty when the league doesn't score teams. */
  teams: FinaleStandingRow[];
  teamLogos: { id: string; name: string; color: string | null; logo: string | null }[];
  medals: { players: FinaleMedalRow[]; teams: FinaleMedalRow[] };
  awards: FinaleAward[];
  viewerTeamId: string | null;
};

export interface ILeagueFinaleQuery {
  /**
   * `preview` (site admins only, with `asAdmin`) lets them watch any league's
   * finale with its current standings before it's released.
   */
  execute(input: { actorUserId: string; leagueId: string; preview?: boolean; asAdmin?: boolean }): Promise<LeagueFinaleResult>;
}
