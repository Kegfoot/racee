export type AdminFinaleSeasonDTO = {
  seasonId: string;
  label: string;
  lastRaceStarted: boolean;
  racesTotal: number;
  racesUngraded: number;
  /** Library questions for this season that still have no answer (and aren't thrown out). */
  questionsUnanswered: number;
  released: boolean;
  leagueCount: number;
  /** Leagues whose commissioner has released their half. */
  leaguesReleased: number;
};

export interface IAdminFinaleOverviewQuery {
  execute(motorsportId: string): Promise<{ motorsportId: string; seasons: AdminFinaleSeasonDTO[] }>;
}
