import type {
  ILeagueRepository,
  IMotorsportCalendarRepository,
  INotificationRepository,
  IRaceRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
} from "@/server/repositories";
import { InvariantViolationError, NotFoundError } from "@/server/domain/errors";
import { SeasonProps } from "@/server/domain/season-props";
import { assertLeagueCommissioner } from "@/server/roles/league";
import { resolveAnswer } from "@/server/services/season-props";
import { lastRaceStarted } from "@/server/services/season-finale-gate";
import { finaleReadyNotification } from "@/server/services/finale-notification";
import { loadFinaleGate } from "@/server/queries/shared/finale-gate";
import type { IReleaseFinaleCommand, ReleaseFinalePayload } from "./IReleaseFinaleCommand";

/**
 * The commissioner's half of the finale release. Allowed once the season's last
 * race has started (or the season has ended) and every year-long question is
 * answered or thrown out. The finale opens for the league when the site admins
 * have released their half too; whoever clicks last notifies the league.
 * Unprefixed — spans several repositories.
 */
export class ReleaseFinaleCommand implements IReleaseFinaleCommand {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly races: IRaceRepository,
    private readonly props: ISeasonPropsRepository,
    private readonly libraries: ISeasonQuestionLibraryRepository,
    private readonly calendars: IMotorsportCalendarRepository,
    private readonly notifications: INotificationRepository,
  ) {}

  async execute(payload: ReleaseFinalePayload): Promise<void> {
    const league = await this.leagues.findById(payload.leagueId);
    if (!league) throw new NotFoundError("League", payload.leagueId);
    assertLeagueCommissioner(payload.actorUserId, league);

    const seasonRaces = league.currentSeasonRaces(await this.races.findAllForMotorsport(league.motorsportId));
    if (!league.isSeasonEnded && !lastRaceStarted(seasonRaces, new Date())) {
      throw new InvariantViolationError("The finale can be released once the season's last race has started");
    }

    const props = (await this.props.find(league.leagueId, league.seasonKey)) ?? SeasonProps.empty(league.leagueId, league.seasonKey);
    if (props.isFinaleReleased()) return;
    if (props.enabled && props.open) {
      const library = await this.libraries.findByMotorsport(league.motorsportId);
      const waiting = props.questions.filter((q) => resolveAnswer(q, library.questions) === null);
      if (waiting.length > 0) {
        throw new InvariantViolationError(
          `${waiting.length} season question${waiting.length === 1 ? " still needs its" : "s still need their"} answer before the finale can be released`,
        );
      }
    }

    const now = new Date().toISOString();
    props.releaseFinale(now);
    await this.props.save(props);

    const gate = await loadFinaleGate({ props: this.props, calendars: this.calendars }, league, seasonRaces);
    if (gate.phase === "released") {
      for (const userId of league.memberIds) await this.notifications.add(userId, finaleReadyNotification(league.name, now));
    }
  }
}
