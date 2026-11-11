import type {
  ILeagueHistoryRepository,
  ILeagueRepository,
  ILeagueStandingsRepository,
  IRaceRepository,
  ITeamRepository,
  IUserRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
  IMotorsportCalendarRepository,
} from "@/server/repositories";
import { loadSeasonBonus } from "@/server/queries/shared/season-bonus";
import { loadFinaleGate } from "@/server/queries/shared/finale-gate";
import { NotFoundError } from "@/server/domain/errors";
import { assertLeagueMember, isLeagueCommissioner } from "@/server/roles/league";
import { buildSeasonRecord, seasonParticipantIds } from "@/server/services/season-record";
import type { ILeagueHistoryQuery, LeagueHistoryResult } from "./ILeagueHistoryQuery";

/** Every season a league has played: the history book plus the season in progress. */
export class LeagueHistoryQuery implements ILeagueHistoryQuery {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly races: IRaceRepository,
    private readonly standings: ILeagueStandingsRepository,
    private readonly teams: ITeamRepository,
    private readonly users: IUserRepository,
    private readonly history: ILeagueHistoryRepository,
    private readonly seasonProps: ISeasonPropsRepository,
    private readonly seasonQuestions: ISeasonQuestionLibraryRepository,
    private readonly calendars: IMotorsportCalendarRepository,
  ) {}

  async execute(input: { actorUserId: string; leagueId: string; asAdmin?: boolean }): Promise<LeagueHistoryResult> {
    const league = await this.leagues.findById(input.leagueId);
    if (!league) throw new NotFoundError("League", input.leagueId);
    if (!input.asAdmin) assertLeagueMember(input.actorUserId, league);

    const [allRaces, standings, teams, history] = await Promise.all([
      this.races.findAllForMotorsport(league.motorsportId),
      this.standings.findByLeague(league.leagueId),
      this.teams.findAllForLeague(league.leagueId),
      this.history.findByLeague(league.leagueId),
    ]);
    const seasonRaces = league.currentSeasonRaces(allRaces);
    const canManage = isLeagueCommissioner(input.actorUserId, league);
    const userIds = [...new Set([...seasonParticipantIds(standings, teams), ...(canManage ? league.memberIds : [])])];
    const users = await this.users.findByIds(userIds);
    const namesById = new Map(users.map((u) => [u.userId, u.name]));
    const now = new Date().toISOString();
    const label = league.displaySeasonLabel(seasonRaces, now.slice(0, 4));

    const bonus = await loadSeasonBonus({ props: this.seasonProps, libraries: this.seasonQuestions }, league, teams, seasonRaces);
    // The final results stay hidden from players until the admins and the commissioner release the finale.
    const gate = await loadFinaleGate({ props: this.seasonProps, calendars: this.calendars }, league, seasonRaces);
    const hideCurrent = gate.phase === "pending" && !canManage && !input.asAdmin;
    const built = buildSeasonRecord({
      bonus,
      seasonId: league.currentSeasonKey,
      label,
      endedAt: league.seasonEndedAt ?? now,
      league,
      races: seasonRaces,
      standings,
      teams,
      namesById,
    });
    const current = hideCurrent ? { ...built, players: [], teams: [] } : built;

    return {
      leagueId: league.leagueId,
      leagueName: league.name,
      canManage,
      isPrivate: league.isPrivate,
      current: {
        label,
        ended: league.isSeasonEnded,
        endedAt: league.seasonEndedAt,
        scoredRaces: seasonRaces.filter((r) => r.keySetAt !== null).length,
        totalRaces: seasonRaces.filter((r) => !r.cancelled).length,
        unscoredRaces: seasonRaces.filter((r) => !r.cancelled && r.keySetAt === null).length,
        undoSeasonLabel:
          canManage && league.seasonRacesAfter !== null && !league.isSeasonEnded
            ? (history.lastPlayedSeason?.label ?? null)
            : null,
      },
      seasons: [
        // The rules/teams snapshots stay server-side (they're only for "go back").
        ...history.seasons.map((s) => {
          const rest = { ...s };
          delete rest.leagueSnapshot;
          delete rest.teamsSnapshot;
          return { ...rest, status: "complete" as const };
        }),
        { ...current, status: league.isSeasonEnded ? ("ended" as const) : ("in_progress" as const) },
      ],
      members: canManage
        ? league.memberIds
            .map((id) => ({ id, name: namesById.get(id) ?? "Unknown player" }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    };
  }
}
