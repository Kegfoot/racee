import type {
  ILeagueHistoryRepository,
  ILeagueRepository,
  ILeagueStandingsRepository,
  IProfilePrivacyRepository,
  IRaceRepository,
  IUserRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
} from "@/server/repositories";
import { loadSeasonBonus } from "@/server/queries/shared/season-bonus";
import { NotFoundError } from "@/server/domain/errors";
import { trophyKey } from "@/server/domain/profile-privacy";
import type { SeasonPlayerRecord } from "@/server/domain/league-history";
import { buildSeasonRecord } from "@/server/services/season-record";
import { medalForRank } from "@/lib/medals";
import type { ITrophyShelfQuery, ShelfLeagueDTO, ShelfSeasonDTO, TrophyShelfResult } from "./ITrophyShelfQuery";
import type { SeasonStatus } from "@/server/queries/league-history/ILeagueHistoryQuery";

/**
 * A player's medals and trophies in every league they've played in, past
 * seasons and the current one. Respects the player's privacy settings for
 * everyone but themselves: hidden leagues only show to that league's members,
 * hidden trophies show to nobody else.
 */
export class TrophyShelfQuery implements ITrophyShelfQuery {
  constructor(
    private readonly users: IUserRepository,
    private readonly leagues: ILeagueRepository,
    private readonly races: IRaceRepository,
    private readonly standings: ILeagueStandingsRepository,
    private readonly history: ILeagueHistoryRepository,
    private readonly privacy: IProfilePrivacyRepository,
    private readonly seasonProps: ISeasonPropsRepository,
    private readonly seasonQuestions: ISeasonQuestionLibraryRepository,
  ) {}

  async execute(input: { viewerId: string; userId: string }): Promise<TrophyShelfResult> {
    const [user, allLeagues, privacy] = await Promise.all([
      this.users.findById(input.userId),
      this.leagues.findAll(),
      this.privacy.find(input.userId),
    ]);
    if (!user) throw new NotFoundError("User", input.userId);
    const isSelf = input.viewerId === input.userId;
    const now = new Date().toISOString();

    const shelves = await Promise.all(
      allLeagues.map(async (league): Promise<ShelfLeagueDTO | null> => {
        const viewerIsMember = league.isMember(input.viewerId) || league.canManage(input.viewerId);
        const restricted = !isSelf && !league.canBeSeenInsideBy(input.viewerId);
        const hidden = privacy.isLeagueHidden(league.leagueId);
        if (hidden && !isSelf && !viewerIsMember) return null;

        const [history, standings, allRaces] = await Promise.all([
          this.history.findByLeague(league.leagueId),
          this.standings.findByLeague(league.leagueId),
          this.races.findAllForMotorsport(league.motorsportId),
        ]);

        const toSeason = (seasonId: string, label: string, status: SeasonStatus, row: SeasonPlayerRecord): ShelfSeasonDTO => {
          const key = trophyKey(league.leagueId, seasonId);
          const trophyHidden = privacy.isTrophyHidden(key);
          const earned = status !== "in_progress" && row.rank !== null ? medalForRank(row.rank, row.total) : null;
          return {
            seasonId,
            label,
            status,
            rank: row.rank,
            total: restricted ? null : row.total,
            trophy: trophyHidden && !isSelf ? null : earned,
            trophyKey: key,
            trophyHidden: isSelf ? trophyHidden : false,
            medals: row.medals,
            medalDetails: restricted ? [] : row.medalDetails,
            raceWins: row.raceWins,
          };
        };

        const seasons: ShelfSeasonDTO[] = history.seasons.flatMap((s) => {
          const row = s.players.find((p) => p.userId === input.userId);
          return row ? [toSeason(s.seasonId, s.label, "complete", row)] : [];
        });

        if (league.showsInStandings(input.userId) || league.commissionerId === input.userId) {
          const seasonRaces = league.currentSeasonRaces(allRaces);
          const bonus = await loadSeasonBonus({ props: this.seasonProps, libraries: this.seasonQuestions }, league, [], seasonRaces);
          const current = buildSeasonRecord({
            bonus,
            seasonId: league.currentSeasonKey,
            label: league.displaySeasonLabel(seasonRaces, now.slice(0, 4)),
            endedAt: league.seasonEndedAt ?? now,
            league,
            races: seasonRaces,
            standings,
            teams: [],
            namesById: new Map([[user.userId, user.name]]),
          });
          const row = current.players.find((p) => p.userId === input.userId);
          if (row) seasons.push(toSeason(league.currentSeasonKey, current.label, league.isSeasonEnded ? "ended" : "in_progress", row));
        }

        if (seasons.length === 0) return null;
        return {
          leagueId: league.leagueId,
          name: league.name,
          viewerIsMember,
          restricted,
          hidden: isSelf ? hidden : false,
          seasons: seasons.reverse(),
        };
      }),
    );

    const leagues = shelves.filter((s): s is ShelfLeagueDTO => s !== null).sort((a, b) => a.name.localeCompare(b.name));
    const visibleTrophies = new Set(leagues.flatMap((l) => l.seasons.filter((s) => s.trophy).map((s) => s.trophyKey)));
    return {
      userId: user.userId,
      name: user.name,
      isSelf,
      featuredTrophyKeys: privacy.featuredTrophyKeys.filter((k) => visibleTrophies.has(k)),
      leagues,
    };
  }
}
