import type { PropName } from "@/lib/schemas";
import { orderSeasonRaces } from "@/lib/race-order";
import { NotFoundError } from "@/server/domain/errors";
import { assertLeagueMember } from "@/server/roles/league";
import type {
  ILeagueRepository,
  ILeagueStandingsRepository,
  IRacePredictionBookRepository,
  IRaceRepository,
  ITeamRepository,
  IUserRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
} from "@/server/repositories";
import { loadSeasonBonus } from "@/server/queries/shared/season-bonus";
import type { Team } from "@/server/domain/team";
import type {
  ITeamDashboardQuery,
  PropAccuracyStat,
  TeamDashboardResult,
  TeamMemberStatsDTO,
  TeamRaceDTO,
  TeamSummaryDTO,
} from "./ITeamDashboardQuery";

const PROP_NAMES: PropName[] = [
  "driverOfDay", "lapsLed", "fastestPitStop", "fastestLap", "overAchiever", "underAchiever", "wrecker",
];

type PropTally = Map<PropName, { correct: number; total: number }>;

function addTally(into: PropTally, from: PropTally) {
  for (const [prop, t] of from) {
    const cur = into.get(prop) ?? { correct: 0, total: 0 };
    into.set(prop, { correct: cur.correct + t.correct, total: cur.total + t.total });
  }
}

function tallyToStats(tally: PropTally): { overall: number; byType: PropAccuracyStat[] } {
  const byType: PropAccuracyStat[] = [];
  let correct = 0;
  let total = 0;
  for (const prop of PROP_NAMES) {
    const t = tally.get(prop);
    if (!t || t.total === 0) continue;
    correct += t.correct;
    total += t.total;
    byType.push({ propType: prop, correct: t.correct, total: t.total, accuracy: t.correct / t.total });
  }
  return { overall: total > 0 ? correct / total : 0, byType };
}

const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Team dashboard for one league: the chosen team's summary, every member's
 * league-scoped stats and share of the team's points, race-by-race results,
 * and every team side by side. Scoring numbers come from the league's
 * standings (so they match the Standings page); prop accuracy comes from the
 * league's prediction books for graded races. Unprefixed — composes the
 * league, team, standings, race, prediction-book (blob) and user (prisma)
 * repositories.
 */
export class TeamDashboardQuery implements ITeamDashboardQuery {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly teams: ITeamRepository,
    private readonly standings: ILeagueStandingsRepository,
    private readonly races: IRaceRepository,
    private readonly books: IRacePredictionBookRepository,
    private readonly users: IUserRepository,
    private readonly seasonProps: ISeasonPropsRepository,
    private readonly seasonQuestions: ISeasonQuestionLibraryRepository,
  ) {}

  async execute(leagueId: string, teamId: string | null, actorUserId: string): Promise<TeamDashboardResult> {
    const league = await this.leagues.findById(leagueId);
    if (!league) throw new NotFoundError("League", leagueId);
    if (!league.canManage(actorUserId)) assertLeagueMember(actorUserId, league);

    const [teams, standings, seasonRaces] = await Promise.all([
      this.teams.findAllForLeague(leagueId),
      this.standings.findByLeague(leagueId),
      this.races.findAllForMotorsport(league.motorsportId).then((all) => league.currentSeasonRaces(all)),
    ]);
    const teamScoringEnabled = (league.teamPositionPoints?.length ?? 0) > 0;
    const viewerTeamId = teams.find((t) => t.memberIds.includes(actorUserId))?.teamId ?? null;

    const emptyAverages = { teamPoints: 0, avgTeamPointsPerRace: 0, combinedDriverPoints: 0, avgDriverPointsPerMember: 0, propAccuracy: 0 };
    if (teams.length === 0) {
      return {
        teamScoringEnabled, teamCount: 0, team: null, pointsBehindLeader: 0, members: [],
        teamPropAccuracyByType: [], races: [], leagueTeams: [], leagueAverages: emptyAverages, viewerTeamId, canEditLogo: false,
      };
    }
    const target = (teamId && teams.find((t) => t.teamId === teamId)) || teams.find((t) => t.teamId === viewerTeamId) || teams[0];
    if (teamId && target.teamId !== teamId) throw new NotFoundError("Team", teamId);

    // Season order, graded (scored) races only. Order BEFORE dropping cancelled
    // races: a replacement is placed right after the cancelled race it replaces,
    // which only works while that race is still in the list.
    const ordered = orderSeasonRaces(seasonRaces, (r) => r.raceId).filter((r) => !r.cancelled);
    const graded = ordered.filter((r) => r.keySetAt !== null);
    const gradedIds = new Set(graded.map((r) => r.raceId));

    // ---- Driver scoring (matches the standings page) ----
    const individual = new Map((standings?.individual ?? []).map((u) => [u.userId, u.raceScores]));
    const bonus = await loadSeasonBonus({ props: this.seasonProps, libraries: this.seasonQuestions }, league, teams, seasonRaces);
    const driverRanking = (standings?.rankIndividual(league.mulliganCount) ?? [])
      .filter((r) => league.showsInStandings(r.userId))
      .map((r) => ({ ...r, total: r.total + (bonus.players.get(r.userId) ?? 0) }))
      .sort((a, b) => b.total - a.total);
    const driverTotal = new Map(driverRanking.map((r) => [r.userId, r.total]));
    const driverRank = new Map(driverRanking.map((r, i) => [r.userId, i + 1]));

    // ---- Team scoring: weekly team points per team per race ----
    const teamRacePoints = new Map<string, Map<string, number>>();
    const teamRaceEntries = new Map<string, Map<string, { userId?: string; points: number }[]>>();
    for (const t of standings?.teams ?? []) {
      const byRace = new Map<string, number>();
      const entries = new Map<string, { userId?: string; points: number }[]>();
      for (const s of t.raceScores) {
        byRace.set(s.raceId, (byRace.get(s.raceId) ?? 0) + s.weeklyTeamPoints);
        entries.set(s.raceId, [...(entries.get(s.raceId) ?? []), { userId: s.userId, points: s.weeklyTeamPoints }]);
      }
      teamRacePoints.set(t.teamId, byRace);
      teamRaceEntries.set(t.teamId, entries);
    }
    const teamTotal = (id: string) =>
      [...(teamRacePoints.get(id)?.values() ?? [])].reduce((a, b) => a + b, 0) + (bonus.teams.get(id) ?? 0);

    // ---- Prop accuracy from prediction books ----
    const allMemberIds = [...new Set(teams.flatMap((t) => [...t.memberIds]))];
    const books = await this.books.findAllForRaces(leagueId, ordered.map((r) => r.raceId));
    const raceById = new Map(ordered.map((r) => [r.raceId, r]));
    const propTally = new Map<string, PropTally>();
    const racesPredicted = new Map<string, number>();
    const propsCalled = new Map<string, number>();
    for (const book of books) {
      const race = raceById.get(book.raceId);
      if (!race) continue;
      for (const userId of allMemberIds) {
        const pred = book.predictionFor(userId);
        if (!pred) continue;
        racesPredicted.set(userId, (racesPredicted.get(userId) ?? 0) + 1);
        const picks = pred.propPicks;
        for (const prop of PROP_NAMES) {
          const answer = picks[prop];
          if (!answer) continue;
          propsCalled.set(userId, (propsCalled.get(userId) ?? 0) + 1);
          if (!gradedIds.has(race.raceId) || !race.propKey) continue;
          const correctAnswers = race.propKey[prop];
          if (!correctAnswers) continue;
          const tally = propTally.get(userId) ?? new Map();
          const cur = tally.get(prop) ?? { correct: 0, total: 0 };
          tally.set(prop, { correct: cur.correct + (correctAnswers.includes(answer) ? 1 : 0), total: cur.total + 1 });
          propTally.set(userId, tally);
        }
      }
    }

    const users = allMemberIds.length > 0 ? await this.users.findByIds(allMemberIds) : [];
    const nameOf = new Map(users.map((u) => [u.userId, u.name]));

    // ---- Per-team summaries (for the comparison table) ----
    const teamPropTally = (team: Team) => {
      const tally: PropTally = new Map();
      for (const id of team.memberIds) addTally(tally, propTally.get(id) ?? new Map());
      return tally;
    };
    const teamRanking = (standings?.rankTeams() ?? [])
      .map((r) => ({ ...r, total: r.total + (bonus.teams.get(r.teamId) ?? 0) }))
      .sort((a, b) => b.total - a.total);
    const summaries: TeamSummaryDTO[] = teams.map((team) => {
      const driverPts = team.memberIds.map((id) => driverTotal.get(id) ?? 0);
      const racesWithTeamScore = [...(teamRacePoints.get(team.teamId)?.keys() ?? [])].filter((id) => gradedIds.has(id)).length;
      const points = teamTotal(team.teamId);
      const rankIdx = teamRanking.findIndex((r) => r.teamId === team.teamId);
      return {
        id: team.teamId,
        name: team.name,
        color: team.color ?? null,
        logo: team.logo,
        memberCount: team.memberIds.length,
        teamPoints: points,
        teamRank: teamScoringEnabled && rankIdx >= 0 ? rankIdx + 1 : null,
        avgTeamPointsPerRace: racesWithTeamScore > 0 ? points / racesWithTeamScore : 0,
        combinedDriverPoints: driverPts.reduce((a, b) => a + b, 0),
        avgDriverPointsPerMember: avg(driverPts),
        propAccuracy: tallyToStats(teamPropTally(team)).overall,
      };
    });
    const leagueTeams = [...summaries].sort((a, b) =>
      teamScoringEnabled ? b.teamPoints - a.teamPoints : b.combinedDriverPoints - a.combinedDriverPoints,
    );
    const team = summaries.find((s) => s.id === target.teamId)!;
    const leaderPoints = teamScoringEnabled ? (leagueTeams[0]?.teamPoints ?? 0) : (leagueTeams[0]?.combinedDriverPoints ?? 0);
    const myPoints = teamScoringEnabled ? team.teamPoints : team.combinedDriverPoints;

    // ---- Contribution to THIS team ----
    // A player's weekly team points are recorded for every race, including races
    // before they joined this team, but the team total only counts races they
    // scored for it. Newer results record which player each team point came from;
    // for older ones, a member's points only count in races the team scored, and
    // are scaled down if they'd add up to more than the team actually got.
    const contributionOf = new Map<string, number>();
    for (const race of graded) {
      const entries = teamRaceEntries.get(target.teamId)?.get(race.raceId);
      if (!entries) continue;
      const teamPts = entries.reduce((a, e) => a + e.points, 0);
      if (entries.some((e) => e.userId)) {
        for (const e of entries) if (e.userId) contributionOf.set(e.userId, (contributionOf.get(e.userId) ?? 0) + e.points);
        continue;
      }
      const raw = target.memberIds.map((id) => ({
        id,
        pts: individual.get(id)?.find((s) => s.raceId === race.raceId)?.weeklyTeamPoints ?? 0,
      }));
      const rawSum = raw.reduce((a, r) => a + r.pts, 0);
      const scale = rawSum > teamPts && rawSum > 0 ? teamPts / rawSum : 1;
      for (const r of raw) contributionOf.set(r.id, (contributionOf.get(r.id) ?? 0) + r.pts * scale);
    }

    // ---- Members ----
    const members: TeamMemberStatsDTO[] = target.memberIds.map((userId) => {
      const scores = (individual.get(userId) ?? []).filter((s) => gradedIds.has(s.raceId));
      const combined = scores.map((s) => s.gridPoints + s.propPoints);
      const best = scores.reduce<(typeof scores)[number] | null>(
        (b, s) => (!b || s.gridPoints + s.propPoints > b.gridPoints + b.propPoints ? s : b),
        null,
      );
      const contribution = contributionOf.get(userId) ?? 0;
      const props = tallyToStats(propTally.get(userId) ?? new Map());
      return {
        userId,
        name: nameOf.get(userId) ?? "Unknown",
        driverTotal: driverTotal.get(userId) ?? 0,
        driverRank: driverRank.get(userId) ?? null,
        gridPoints: scores.reduce((a, s) => a + s.gridPoints, 0),
        propPoints: scores.reduce((a, s) => a + s.propPoints, 0),
        racesScored: scores.length,
        avgPerRace: avg(combined),
        bestRace: best
          ? { raceId: best.raceId, title: raceById.get(best.raceId)?.title ?? "", points: best.gridPoints + best.propPoints }
          : null,
        teamContribution: contribution,
        contributionShare: team.teamPoints > 0 ? Math.min(1, contribution / team.teamPoints) : 0,
        racesPredicted: racesPredicted.get(userId) ?? 0,
        propsCalled: propsCalled.get(userId) ?? 0,
        propAccuracy: props.overall,
        propAccuracyByType: props.byType,
      };
    });
    // Biggest helper first: team contribution when teams score, else driver total.
    members.sort((a, b) => (teamScoringEnabled ? b.teamContribution - a.teamContribution : 0) || b.driverTotal - a.driverTotal);

    // ---- Race by race ----
    const races: TeamRaceDTO[] = graded.flatMap((race) => {
      const pts = teamRacePoints.get(target.teamId)?.get(race.raceId) ?? 0;
      const others = teams
        .map((t) => teamRacePoints.get(t.teamId)?.get(race.raceId))
        .filter((p): p is number => p !== undefined);
      const memberScores = target.memberIds
        .map((id) => {
          const s = individual.get(id)?.find((r) => r.raceId === race.raceId);
          return s ? { userId: id, name: nameOf.get(id) ?? "Unknown", points: s.gridPoints + s.propPoints } : null;
        })
        .filter((x): x is { userId: string; name: string; points: number } => x !== null)
        .sort((a, b) => b.points - a.points);
      const hasTeamScore = teamRacePoints.get(target.teamId)?.has(race.raceId) ?? false;
      // Nothing to show for a race nobody on this team scored in.
      if (!hasTeamScore && memberScores.length === 0) return [];
      return [{
        raceId: race.raceId,
        title: race.title,
        label: race.label ?? null,
        teamPoints: pts,
        rankThatRace: teamScoringEnabled && hasTeamScore ? 1 + others.filter((p) => p > pts).length : null,
        topMember: memberScores[0] ?? null,
      }];
    });

    return {
      teamScoringEnabled,
      teamCount: teams.length,
      team,
      pointsBehindLeader: Math.max(0, leaderPoints - myPoints),
      members,
      teamPropAccuracyByType: tallyToStats(teamPropTally(target)).byType,
      races,
      leagueTeams,
      leagueAverages: {
        teamPoints: avg(summaries.map((s) => s.teamPoints)),
        avgTeamPointsPerRace: avg(summaries.map((s) => s.avgTeamPointsPerRace)),
        combinedDriverPoints: avg(summaries.map((s) => s.combinedDriverPoints)),
        avgDriverPointsPerMember: avg(summaries.map((s) => s.avgDriverPointsPerMember)),
        propAccuracy: avg(summaries.map((s) => s.propAccuracy)),
      },
      viewerTeamId,
      canEditLogo: league.canManage(actorUserId) || target.memberIds.includes(actorUserId),
    };
  }
}
