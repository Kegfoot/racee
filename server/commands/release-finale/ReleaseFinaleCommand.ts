import type {
  ILeagueRepository,
  INotificationRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
} from "@/server/repositories";
import { InvariantViolationError, NotFoundError } from "@/server/domain/errors";
import { SeasonProps } from "@/server/domain/season-props";
import { assertLeagueCommissioner } from "@/server/roles/league";
import { resolveAnswer } from "@/server/services/season-props";
import type { IReleaseFinaleCommand, ReleaseFinalePayload } from "./IReleaseFinaleCommand";

/**
 * Releases the season finale: the final standings, trophies and the finale video
 * become visible to the league. Needs the season ended and every year-long
 * question answered (or thrown out) — the admins' ones and the commissioner's
 * own. Commissioner-only. Unprefixed — spans several repositories.
 */
export class ReleaseFinaleCommand implements IReleaseFinaleCommand {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly props: ISeasonPropsRepository,
    private readonly libraries: ISeasonQuestionLibraryRepository,
    private readonly notifications: INotificationRepository,
  ) {}

  async execute(payload: ReleaseFinalePayload): Promise<void> {
    const league = await this.leagues.findById(payload.leagueId);
    if (!league) throw new NotFoundError("League", payload.leagueId);
    assertLeagueCommissioner(payload.actorUserId, league);
    if (!league.isSeasonEnded) throw new InvariantViolationError("End the season before releasing the finale");

    const props = (await this.props.find(league.leagueId, league.seasonKey)) ?? SeasonProps.empty(league.leagueId, league.seasonKey);
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

    for (const userId of league.memberIds) {
      await this.notifications.add(userId, {
        id: crypto.randomUUID(),
        kind: "season_finale",
        title: `${league.name}: the season finale is ready`,
        body: "The final results are in. Open the standings to watch the finale and see who took home the trophies.",
        createdAt: now,
        read: false,
      });
    }
  }
}
