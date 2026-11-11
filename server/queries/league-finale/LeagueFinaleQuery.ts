import type {
  ILeagueRepository,
  ILeagueStandingsRepository,
  IRacePredictionBookRepository,
  IRaceRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
  ITeamRepository,
  IUserRepository,
} from "@/server/repositories";
import { AuthorizationError, NotFoundError } from "@/server/domain/errors";
import { assertLeagueMember, isLeagueCommissioner } from "@/server/roles/league";
import { buildSeasonRecord, seasonParticipantIds } from "@/server/services/season-record";
import { computeFinaleAwards, type PropAccuracy } from "@/server/services/season-finale";
import { loadSeasonBonus } from "@/server/queries/shared/season-bonus";
import type { FinaleMedalRow, FinaleStandingRow, ILeagueFinaleQuery, LeagueFinaleResult } from "./ILeagueFinaleQuery";

const PROP_NAMES = ["driverOfDay", "lapsLed", "fastestPitStop", "fastestLap", "overAchiever", "underAchiever", "wrecker"] as const;
const FALLBACK_COLOR = "#6b7280";

/**
 * The season finale for one league: the final Drivers' and Constructors' Cup,
 * race medals and the extra awards. Players only get it once the commissioner
 * has released the finale; a commissioner (or admin) can preview it any time.
 * Unprefixed — spans many repositories.
 */
export class LeagueFinaleQuery implements ILeagueFinaleQuery {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly races: IRaceRepository,
    private readonly standings: ILeagueStandingsRepository,
    private readonly teams: ITeamRepository,
    private readonly users: IUserRepository,
    private readonly books: IRacePredictionBookRepository,
    private readonly seasonProps: ISeasonPropsRepository,
    private readonly seasonQuestions: ISeasonQuestionLibraryRepository,
  ) {}

  async execute(input: { actorUserId: string; leagueId: string; preview?: boolean; asAdmin?: boolean }): Promise<LeagueFinaleResult> {
    const league = await this.leagues.findById(input.leagueId);
    if (!league) throw new NotFoundError("League", input.leagueId);
    if (!input.asAdmin) assertLeagueMember(input.actorUserId, league);
    if (input.preview && !input.asAdmin && !isLeagueCommissioner(input.actorUserId, league)) {
      throw new AuthorizationError("Only commissioners can preview the finale");
    }

    const props = await this.seasonProps.find(league.leagueId, league.seasonKey);
    const released = !!props?.isFinaleReleased(league.seasonEndedAt);
    const base = {
      leagueId: league.leagueId,
      leagueName: league.name,
      seasonKey: league.seasonKey,
      drivers: [],
      teams: [],
      teamLogos: [],
      medals: { players: [], teams: [] },
      awards: [],
      viewerTeamId: null,
    };
    const now = new Date().toISOString();

    const state = input.preview ? "preview" : !league.isSeasonEnded ? "none" : released ? "released" : "pending";
    if (state === "none" || state === "pending") {
      const allRaces = await this.races.findAllForMotorsport(league.motorsportId);
      return { ...base, state, seasonLabel: league.displaySeasonLabel(league.currentSeasonRaces(allRaces), now.slice(0, 4)) };
    }

    const [allRaces, standings, teams] = await Promise.all([
      this.races.findAllForMotorsport(league.motorsportId),
      this.standings.findByLeague(league.leagueId),
      this.teams.findAllForLeague(league.leagueId),
    ]);
    const seasonRaces = league.currentSeasonRaces(allRaces);
    const users = await this.users.findByIds(seasonParticipantIds(standings, teams));
    const namesById = new Map(users.map((u) => [u.userId, u.name]));
    const bonus = await loadSeasonBonus({ props: this.seasonProps, libraries: this.seasonQuestions }, league, teams, seasonRaces);
    const label = league.displaySeasonLabel(seasonRaces, now.slice(0, 4));
    const record = buildSeasonRecord({
      seasonId: league.currentSeasonKey,
      label,
      endedAt: league.seasonEndedAt ?? now,
      league,
      races: seasonRaces,
      standings,
      teams,
      namesById,
      bonus,
    });

    // Weekly prop accuracy (for the Prop Wizard): graded races only.
    const graded = seasonRaces.filter((r) => r.keySetAt !== null && !r.cancelled && r.propKey);
    const books = await this.books.findAllForRaces(league.leagueId, graded.map((r) => r.raceId));
    const raceById = new Map(graded.map((r) => [r.raceId, r]));
    const accuracy = new Map<string, PropAccuracy>();
    for (const book of books) {
      const race = raceById.get(book.raceId);
      if (!race?.propKey) continue;
      for (const p of record.players) {
        if (!p.userId) continue;
        const pick = book.predictionFor(p.userId);
        if (!pick) continue;
        for (const prop of PROP_NAMES) {
          const answer = pick.propPicks[prop];
          const key = race.propKey[prop];
          if (!answer || !key) continue;
          const cur = accuracy.get(p.userId) ?? { correct: 0, total: 0 };
          accuracy.set(p.userId, { correct: cur.correct + (key.includes(answer) ? 1 : 0), total: cur.total + 1 });
        }
      }
    }

    const teamOfUser = new Map<string, { name: string; color: string | null }>();
    for (const t of record.teams) for (const id of t.memberUserIds) teamOfUser.set(id, { name: t.name, color: t.color });

    const drivers: FinaleStandingRow[] = record.players
      .filter((p) => p.userId !== null && p.rank !== null)
      .map((p) => ({
        id: p.userId!,
        name: p.name,
        total: p.total,
        rank: p.rank!,
        color: teamOfUser.get(p.userId!)?.color ?? FALLBACK_COLOR,
        subtitle: teamOfUser.get(p.userId!)?.name ?? "",
      }));
    const teamRows: FinaleStandingRow[] = record.teams
      .filter((t) => t.teamId !== null && t.rank !== null)
      .map((t) => ({
        id: t.teamId!,
        name: t.name,
        total: t.total,
        rank: t.rank!,
        color: t.color ?? FALLBACK_COLOR,
        subtitle: t.memberNames.join(" · "),
      }));
    const medalRow = (id: string, name: string, color: string, m: { gold: number; silver: number; bronze: number }): FinaleMedalRow => ({
      id, name, color, gold: m.gold, silver: m.silver, bronze: m.bronze,
    });
    const byMedals = (a: FinaleMedalRow, b: FinaleMedalRow) =>
      b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.name.localeCompare(b.name);

    return {
      ...base,
      state,
      seasonLabel: label,
      drivers,
      teams: teamRows,
      teamLogos: teams.map((t) => ({ id: t.teamId, name: t.name, color: t.color ?? null, logo: t.logo })),
      medals: {
        players: record.players
          .filter((p) => p.userId !== null)
          .map((p) => medalRow(p.userId!, p.name, teamOfUser.get(p.userId!)?.color ?? FALLBACK_COLOR, p.medals))
          .filter((m) => m.gold + m.silver + m.bronze > 0)
          .sort(byMedals),
        teams: record.teams
          .filter((t) => t.teamId !== null)
          .map((t) => medalRow(t.teamId!, t.name, t.color ?? FALLBACK_COLOR, t.medals))
          .filter((m) => m.gold + m.silver + m.bronze > 0)
          .sort(byMedals),
      },
      awards: computeFinaleAwards(record, accuracy),
      viewerTeamId: teams.find((t) => t.memberIds.includes(input.actorUserId))?.teamId ?? null,
    };
  }
}
