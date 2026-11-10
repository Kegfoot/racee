import type { RaceScoreEntry, User as UserDTO } from "@/lib/schemas";

export type DriverRowDTO = {
  userId: string;
  total: number;
  mulliganed: number;
  /** Season-bet points already included in `total` (0 when none, or while hidden). */
  seasonBonus: number;
  rawTotal: number;
  propTotal: number;
  raceScores: RaceScoreEntry[];
};

export type ConstructorRowDTO = {
  teamId: string;
  total: number;
  seasonBonus: number;
  rawTotal: number;
  propTotal: number;
  raceScores: RaceScoreEntry[];
};

export type LeagueStandingsViewResult = {
  gradedRaceIds: string[];
  stages: string[][];
  driverRows: DriverRowDTO[];
  constructorRows: ConstructorRowDTO[];
  /** True while the league's season-bet points are hidden (not in anyone's total yet). */
  seasonBetsHidden: boolean;
  usersById: Record<string, UserDTO>;
};

export interface ILeagueStandingsViewQuery {
  execute(actorUserId: string, leagueId: string): Promise<LeagueStandingsViewResult>;
}
