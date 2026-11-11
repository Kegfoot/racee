import type { ILeagueRepository, ISeasonPropsRepository } from "@/server/repositories";
import { InvariantViolationError, NotFoundError } from "@/server/domain/errors";
import { assertLeagueCommissioner } from "@/server/roles/league";
import type { ISetLateSeasonPickerCommand, SetLateSeasonPickerPayload } from "./ISetLateSeasonPickerCommand";

/** The commissioner's call on a player who joined after season picks locked: may they still pick? */
export class SetLateSeasonPickerCommand implements ISetLateSeasonPickerCommand {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly props: ISeasonPropsRepository,
  ) {}

  async execute(payload: SetLateSeasonPickerPayload): Promise<void> {
    const league = await this.leagues.findById(payload.leagueId);
    if (!league) throw new NotFoundError("League", payload.leagueId);
    assertLeagueCommissioner(payload.actorUserId, league);
    const props = await this.props.find(league.leagueId, league.seasonKey);
    if (!props) throw new InvariantViolationError("This league isn't playing season bets");
    props.setLatePicker(payload.userId, payload.allowed);
    await this.props.save(props);
  }
}
