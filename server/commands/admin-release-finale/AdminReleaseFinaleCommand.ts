import type {
  ILeagueRepository,
  IMotorsportCalendarRepository,
  INotificationRepository,
  IRaceRepository,
  ISeasonPropsRepository,
} from "@/server/repositories";
import { InvariantViolationError } from "@/server/domain/errors";
import { lastRaceStarted } from "@/server/services/season-finale-gate";
import { finaleReadyNotification } from "@/server/services/finale-notification";
import type { AdminReleaseFinalePayload, IAdminReleaseFinaleCommand } from "./IAdminReleaseFinaleCommand";

/**
 * The site admins' half of the finale release, for every league racing the
 * season. Needs the season's last race to have started and every race graded.
 * Leagues whose commissioner already released get their notification now.
 * Admin-only (enforced by the procedure). Unprefixed — spans several repositories.
 */
export class AdminReleaseFinaleCommand implements IAdminReleaseFinaleCommand {
  constructor(
    private readonly calendars: IMotorsportCalendarRepository,
    private readonly races: IRaceRepository,
    private readonly leagues: ILeagueRepository,
    private readonly props: ISeasonPropsRepository,
    private readonly notifications: INotificationRepository,
  ) {}

  async execute(payload: AdminReleaseFinalePayload): Promise<void> {
    const calendar = await this.calendars.findByMotorsport(payload.motorsportId);
    const season = calendar.find(payload.seasonId);
    if (!season) throw new InvariantViolationError("That season doesn't exist");

    if (!payload.release) {
      calendar.setFinaleReleased(payload.seasonId, null);
      await this.calendars.save(calendar);
      return;
    }
    if (season.finaleReleasedAt) return;

    const races = (await this.races.findAllForMotorsport(payload.motorsportId)).filter(
      (r) => calendar.seasonOn(r.date)?.seasonId === payload.seasonId,
    );
    if (!lastRaceStarted(races, new Date())) {
      throw new InvariantViolationError("The season's last race hasn't started yet");
    }
    const ungraded = races.filter((r) => !r.cancelled && r.keySetAt === null).length;
    if (ungraded > 0) {
      throw new InvariantViolationError(`${ungraded} race${ungraded === 1 ? " hasn't" : "s haven't"} been graded yet`);
    }

    const now = new Date().toISOString();
    calendar.setFinaleReleased(payload.seasonId, now);
    await this.calendars.save(calendar);

    const leagues = (await this.leagues.findAll()).filter(
      (l) => l.motorsportId === payload.motorsportId && l.motorsportSeasonId === payload.seasonId,
    );
    for (const league of leagues) {
      const props = await this.props.find(league.leagueId, league.seasonKey);
      if (!props?.isFinaleReleased()) continue;
      for (const userId of league.memberIds) await this.notifications.add(userId, finaleReadyNotification(league.name, now));
    }
  }
}
