import type { League } from "@/server/domain/league";
import type { Race } from "@/server/domain/race";
import type { Team } from "@/server/domain/team";
import type { LeagueStandings } from "@/server/domain/league-standings";
import type {
  MedalDetail,
  SeasonPlayerRecord,
  SeasonRaceColumn,
  SeasonRecord,
  SeasonTeamRecord,
} from "@/server/domain/league-history";
import { mergeReplacedRaceColumns, orderSeasonRaces } from "@/lib/race-order";
import { getMulliganedRaceIds } from "@/lib/scoring";
import { competitionRanks, computeRaceMedals, countRowMedals, type Medal } from "@/lib/medals";
import { NO_BONUS, type SeasonBonus } from "@/server/services/season-props";

/**
 * Builds a season's record from the live standings: final places, totals (with
 * and without mulligans), race medals, wins and high scores, for players and
 * teams. Used to freeze a season into the history book when the next one
 * starts, and to show the season in progress next to past ones.
 */
export function buildSeasonRecord(args: {
  seasonId: string;
  label: string;
  endedAt: string;
  league: League;
  /** The season's races (already limited to this season). */
  races: readonly Race[];
  standings: LeagueStandings | null;
  teams: readonly Team[];
  namesById: ReadonlyMap<string, string>;
  /** Season-bet points added to the totals (they never create race medals). */
  bonus?: SeasonBonus;
}): SeasonRecord {
  const { league, standings, teams, namesById } = args;
  const bonus = args.bonus ?? NO_BONUS;

  const columns: SeasonRaceColumn[] = mergeReplacedRaceColumns(
    orderSeasonRaces(args.races, (r) => r.raceId).map((r) => ({
      id: r.raceId,
      title: r.title,
      label: r.label,
      date: r.date,
      cancelled: r.cancelled,
      replacesRaceId: r.replacesRaceId,
    })),
  ).map((r) => ({
    raceId: r.id,
    label: r.label ?? r.title,
    date: r.date,
    cancelled: !!r.cancelled,
    replacesLabel: r.replacesLabel ?? null,
  }));
  const columnById = new Map(columns.map((c) => [c.raceId, c]));
  const inSeason = (raceId: string) => columnById.has(raceId);

  const medalDetailsFor = (
    medalsByRace: Record<string, Record<string, Medal>>,
    rowId: string,
    scores: Record<string, number>,
  ): MedalDetail[] =>
    columns.flatMap((c) => {
      const medal = medalsByRace[c.raceId]?.[rowId];
      return medal ? [{ raceId: c.raceId, raceLabel: c.label, date: c.date, medal, points: scores[c.raceId] ?? 0 }] : [];
    });

  // ---- players ----
  const playerScores = (standings?.individual ?? [])
    .filter((u) => league.showsInStandings(u.userId))
    .map((u) => {
      const raceScores = u.raceScores.filter((s) => inSeason(s.raceId));
      return {
        userId: u.userId,
        raceScores,
        scores: Object.fromEntries(raceScores.map((s) => [s.raceId, s.gridPoints + s.propPoints])) as Record<string, number>,
      };
    });
  const playerMedals = computeRaceMedals(playerScores.map((p) => ({ id: p.userId, scores: p.scores })));
  const playerRows = playerScores.map((p) => {
    const mulliganed = getMulliganedRaceIds(p.raceScores, league.mulliganCount);
    const values = Object.values(p.scores);
    const seasonBonus = bonus.players.get(p.userId) ?? 0;
    const gross = values.reduce((sum, v) => sum + v, 0) + seasonBonus;
    const dropped = [...mulliganed].reduce((sum, id) => sum + (p.scores[id] ?? 0), 0);
    const medals = countRowMedals(playerMedals, p.userId);
    return {
      userId: p.userId,
      name: namesById.get(p.userId) ?? "Unknown player",
      total: gross - dropped,
      gross,
      racesScored: values.length,
      highScore: values.length > 0 ? Math.max(...values) : null,
      medals,
      raceWins: medals.gold,
      medalDetails: medalDetailsFor(playerMedals, p.userId, p.scores),
      raceScores: p.scores,
      mulliganedRaceIds: [...mulliganed],
    };
  });
  const playerRanks = competitionRanks(playerRows, (r) => r.total);
  const players: SeasonPlayerRecord[] = playerRows
    .map((r) => ({ ...r, rank: playerRanks.get(r)! }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  // ---- teams (only when the league scores teams) ----
  const teamScoringOn = (league.teamPositionPoints?.length ?? 0) > 0;
  const teamsById = new Map(teams.map((t) => [t.teamId, t]));
  const teamScores = (teamScoringOn ? (standings?.teams ?? []) : [])
    .filter((t) => teamsById.has(t.teamId))
    .map((t) => {
      const scores: Record<string, number> = {};
      const memberIds = new Set(teamsById.get(t.teamId)!.memberIds);
      for (const s of t.raceScores) {
        if (!inSeason(s.raceId)) continue;
        scores[s.raceId] = (scores[s.raceId] ?? 0) + s.weeklyTeamPoints;
        if (s.userId) memberIds.add(s.userId);
      }
      return { teamId: t.teamId, scores, memberIds: [...memberIds] };
    });
  const teamMedals = computeRaceMedals(teamScores.map((t) => ({ id: t.teamId, scores: t.scores })));
  const teamRows = teamScores.map((t) => {
    const team = teamsById.get(t.teamId)!;
    const values = Object.values(t.scores);
    const medals = countRowMedals(teamMedals, t.teamId);
    return {
      teamId: t.teamId,
      name: team.name,
      color: team.color ?? null,
      total: values.reduce((sum, v) => sum + v, 0) + (bonus.teams.get(t.teamId) ?? 0),
      racesScored: values.length,
      highScore: values.length > 0 ? Math.max(...values) : null,
      medals,
      raceWins: medals.gold,
      medalDetails: medalDetailsFor(teamMedals, t.teamId, t.scores),
      raceScores: t.scores,
      memberUserIds: t.memberIds,
      memberNames: t.memberIds.map((id) => namesById.get(id) ?? "Unknown player"),
      previousTeamIds: [...team.previousTeamIds],
    };
  });
  const teamRanks = competitionRanks(teamRows, (r) => r.total);
  const teamRecords: SeasonTeamRecord[] = teamRows
    .map((r) => ({ ...r, rank: teamRanks.get(r)! }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  return {
    seasonId: args.seasonId,
    label: args.label,
    endedAt: args.endedAt,
    imported: false,
    mulliganCount: league.mulliganCount,
    races: columns,
    players,
    teams: teamRecords,
  };
}

/** Everyone whose name a season record needs: standings rows plus team members. */
export function seasonParticipantIds(standings: LeagueStandings | null, teams: readonly Team[]): string[] {
  return [
    ...new Set([
      ...(standings?.individual.map((u) => u.userId) ?? []),
      ...teams.flatMap((t) => t.memberIds),
      ...(standings?.teams.flatMap((t) => t.raceScores.flatMap((s) => (s.userId ? [s.userId] : []))) ?? []),
    ]),
  ];
}
