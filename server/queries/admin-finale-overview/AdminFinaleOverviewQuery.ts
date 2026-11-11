import type {
  ILeagueRepository,
  IMotorsportCalendarRepository,
  IRaceRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
} from "@/server/repositories";
import { lastRaceStarted } from "@/server/services/season-finale-gate";
import type { AdminFinaleSeasonDTO, IAdminFinaleOverviewQuery } from "./IAdminFinaleOverviewQuery";

/** Where each admin season's finale stands: what is left to grade, and how many leagues are ready. Unprefixed — spans several repositories. */
export class AdminFinaleOverviewQuery implements IAdminFinaleOverviewQuery {
  constructor(
    private readonly calendars: IMotorsportCalendarRepository,
    private readonly races: IRaceRepository,
    private readonly leagues: ILeagueRepository,
    private readonly props: ISeasonPropsRepository,
    private readonly libraries: ISeasonQuestionLibraryRepository,
  ) {}

  async execute(motorsportId: string) {
    const [calendar, races, leagues, library] = await Promise.all([
      this.calendars.findByMotorsport(motorsportId),
      this.races.findAllForMotorsport(motorsportId),
      this.leagues.findAll(),
      this.libraries.findByMotorsport(motorsportId),
    ]);
    const now = new Date();
    const seasons: AdminFinaleSeasonDTO[] = [];
    for (const season of calendar.seasons) {
      const seasonRaces = races.filter((r) => calendar.seasonOn(r.date)?.seasonId === season.seasonId);
      const counted = seasonRaces.filter((r) => !r.cancelled);
      const inSeason = leagues.filter((l) => l.motorsportId === motorsportId && l.motorsportSeasonId === season.seasonId);
      const propsList = await Promise.all(inSeason.map((l) => this.props.find(l.leagueId, l.seasonKey)));
      seasons.push({
        seasonId: season.seasonId,
        label: season.label,
        lastRaceStarted: lastRaceStarted(seasonRaces, now),
        racesTotal: counted.length,
        racesUngraded: counted.filter((r) => r.keySetAt === null).length,
        questionsUnanswered: library.questions.filter(
          (q) => q.motorsportSeasonId === season.seasonId && !q.voided && q.answers.length === 0,
        ).length,
        released: !!season.finaleReleasedAt,
        leagueCount: inSeason.length,
        leaguesReleased: propsList.filter((p) => p?.isFinaleReleased()).length,
      });
    }
    return { motorsportId, seasons };
  }
}
