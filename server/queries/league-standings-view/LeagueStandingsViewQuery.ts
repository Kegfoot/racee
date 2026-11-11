import type {
  ILeagueRepository,
  IRaceRepository,
  ILeagueStandingsRepository,
  IUserRepository,
  ITeamRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
  IMotorsportCalendarRepository,
} from "@/server/repositories";
import { loadSeasonBonus } from "@/server/queries/shared/season-bonus";
import { loadFinaleGate } from "@/server/queries/shared/finale-gate";
import { NotFoundError } from "@/server/domain/errors";
import { assertLeagueMember } from "@/server/roles/league";
import type {
  ILeagueStandingsViewQuery,
  LeagueStandingsViewResult,
} from "./ILeagueStandingsViewQuery";
import { computeSeasonStages } from "@/lib/race-order";

/**
 * The standings page's computed read model: ranked driver/constructor rows,
 * graded race ids, and the stage partitioning of the league's race calendar.
 * League config, races, and teams are deliberately NOT part of this result —
 * the page composes those from their own queries (league, league-teams,
 * races); the participant names (`usersById`) stay here because standings
 * rows can reference users the members query would exclude (the owning
 * commissioner, ex-members with scored races).
 *
 * Unprefixed — composes blob-backed league/race/standings repositories with
 * the prisma-backed user repository.
 */
export class LeagueStandingsViewQuery implements ILeagueStandingsViewQuery {
  constructor(
    private leagues: ILeagueRepository,
    private races: IRaceRepository,
    private standings: ILeagueStandingsRepository,
    private users: IUserRepository,
    private teams: ITeamRepository,
    private seasonProps: ISeasonPropsRepository,
    private seasonQuestions: ISeasonQuestionLibraryRepository,
    private calendars: IMotorsportCalendarRepository,
  ) {}

  async execute(actorUserId: string, leagueId: string): Promise<LeagueStandingsViewResult> {
    const league = await this.leagues.findById(leagueId);
    if (!league) throw new NotFoundError("League", leagueId);
    assertLeagueMember(actorUserId, league);

    const [races, standingsData] = await Promise.all([
      this.races.findAllForMotorsport(league.motorsportId).then((all) => league.currentSeasonRaces(all)),
      this.standings.findByLeague(leagueId),
    ]);

    // Season-bet points join the totals once they're revealed (nothing while hidden).
    const bonus = await loadSeasonBonus(
      { props: this.seasonProps, libraries: this.seasonQuestions },
      league,
      await this.teams.findAllForLeague(leagueId),
      races,
    );

    const mulliganCount = league.mulliganCount;
    const stageCount = league.stageCount ?? 0;

    const sortedRaces = [...races].sort((a, b) => a.date.localeCompare(b.date));

    // Partition the season into stages by calendar slot; a replacement race joins the
    // stage of the cancelled race it replaces instead of shifting every boundary.
    const stages = computeSeasonStages(races, r => r.raceId, stageCount);

    // Before the season's first race is scored, everyone in the league is listed at 0
    // (with their team) so players can see who's racing this season.
    const nothingScored = !sortedRaces.some(r => r.keySetAt !== null);
    const scoredUserIds = new Set(standingsData?.individual.map(u => u.userId) ?? []);
    const previewUserIds = nothingScored ? league.memberIds.filter(id => !scoredUserIds.has(id)) : [];

    // Load users referenced by standings
    const userIds = [...scoredUserIds, ...previewUserIds];
    const userList = await this.users.findByIds(userIds);

    const driverRows = standingsData
      ? standingsData.rankIndividual(mulliganCount)
          // Removed players drop out of the standings unless they were removed with "keep scores".
          .filter(({ userId }) => league.showsInStandings(userId))
          .map(({ userId, total, mulliganed }) => {
          const scores = [...(standingsData.individual.find(u => u.userId === userId)?.raceScores ?? [])];
          const seasonBonus = bonus.players.get(userId) ?? 0;
          return {
            userId,
            total: total + seasonBonus,
            mulliganed,
            seasonBonus,
            rawTotal: scores.reduce((s, r) => s + r.gridPoints, 0),
            propTotal: scores.reduce((s, r) => s + r.propPoints, 0),
            raceScores: scores.map(r => ({
              raceId: r.raceId,
              gridPoints: r.gridPoints,
              propPoints: r.propPoints,
              weeklyTeamPoints: r.weeklyTeamPoints,
            })),
          };
        }).sort((a, b) => b.total - a.total)
      : [];

    const previewDriverRows = previewUserIds.map(userId => ({
      userId, total: bonus.players.get(userId) ?? 0, mulliganed: 0, seasonBonus: bonus.players.get(userId) ?? 0, rawTotal: 0, propTotal: 0, raceScores: [],
    }));
    const leagueTeams = nothingScored ? await this.teams.findAllForLeague(leagueId) : [];

    const constructorRows = standingsData
      ? standingsData.rankTeams().map(({ teamId, total }) => {
          const rawScores = standingsData.teams.find(t => t.teamId === teamId)?.raceScores ?? [];
          const byRace = new Map<string, { gridPoints: number; propPoints: number; weeklyTeamPoints: number }>();
          for (const s of rawScores) {
            const prev = byRace.get(s.raceId) ?? { gridPoints: 0, propPoints: 0, weeklyTeamPoints: 0 };
            byRace.set(s.raceId, {
              gridPoints: prev.gridPoints + s.gridPoints,
              propPoints: prev.propPoints + s.propPoints,
              weeklyTeamPoints: prev.weeklyTeamPoints + s.weeklyTeamPoints,
            });
          }
          const scores = [...byRace.entries()].map(([raceId, pts]) => ({ raceId, ...pts }));
          const seasonBonus = bonus.teams.get(teamId) ?? 0;
          return {
            teamId,
            total: total + seasonBonus,
            seasonBonus,
            rawTotal: scores.reduce((s, r) => s + r.gridPoints, 0),
            propTotal: scores.reduce((s, r) => s + r.propPoints, 0),
            raceScores: scores,
          };
        }).sort((a, b) => b.total - a.total)
      : [];

    const listedTeamIds = new Set(constructorRows.map(r => r.teamId));
    const previewConstructorRows = leagueTeams
      .filter(t => !listedTeamIds.has(t.teamId))
      .map(t => ({ teamId: t.teamId, total: bonus.teams.get(t.teamId) ?? 0, seasonBonus: bonus.teams.get(t.teamId) ?? 0, rawTotal: 0, propTotal: 0, raceScores: [] }));

    // Once the season's last race has started, the standings stay hidden from players until the
    // admins and the commissioner have both released the finale. Commissioners still see them (to finish grading).
    const gate = await loadFinaleGate({ props: this.seasonProps, calendars: this.calendars }, league, races);
    const finalePending = gate.phase === "pending";
    const hideFromViewer = finalePending && !league.canManage(actorUserId);

    return {
      gradedRaceIds: sortedRaces.filter(r => r.keySetAt !== null).map(r => r.raceId),
      stages: hideFromViewer ? [] : stages,
      driverRows: hideFromViewer ? [] : [...driverRows, ...previewDriverRows],
      constructorRows: hideFromViewer ? [] : [...constructorRows, ...previewConstructorRows],
      finalePending,
      finaleHidden: hideFromViewer,
      seasonBetsHidden: !bonus.revealed,
      usersById: Object.fromEntries(userList.map(u => [u.userId, { id: u.userId, name: u.name }])),
    };
  }
}
