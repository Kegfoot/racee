import type { ILeagueRepository, ISeasonPropsRepository } from "@/server/repositories";
import { InvariantViolationError, NotFoundError } from "@/server/domain/errors";
import { assertLeagueMember } from "@/server/roles/league";
import type { ISubmitSeasonPicksCommand, SubmitSeasonPicksPayload } from "./ISubmitSeasonPicksCommand";

/** A player saves their year-long picks, while picks are open for them. */
export class SubmitSeasonPicksCommand implements ISubmitSeasonPicksCommand {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly props: ISeasonPropsRepository,
  ) {}

  async execute(payload: SubmitSeasonPicksPayload): Promise<void> {
    const league = await this.leagues.findById(payload.leagueId);
    if (!league) throw new NotFoundError("League", payload.leagueId);
    assertLeagueMember(payload.actorUserId, league);

    const props = await this.props.find(league.leagueId, league.seasonKey);
    if (!props) throw new InvariantViolationError("This league isn't playing season bets");
    const today = new Date().toISOString().slice(0, 10);
    if (!props.canPick(payload.actorUserId, today, league.isSeasonEnded)) {
      throw new InvariantViolationError("Season picks are closed for you");
    }
    props.setPicks(payload.actorUserId, payload.picks);
    await this.props.save(props);
  }
}
