import type { ILeagueRepository, ISeasonPropsRepository } from "@/server/repositories";
import { NotFoundError } from "@/server/domain/errors";
import { SeasonProps } from "@/server/domain/season-props";
import { assertLeagueCommissioner } from "@/server/roles/league";
import type { ISaveSeasonPropsCommand, SaveSeasonPropsPayload } from "./ISaveSeasonPropsCommand";

/**
 * Saves a league's season-bet setup for the season in progress: whether it's on,
 * the questions, scale, lock day, visibility, and who may pick late.
 * Commissioner-only. Players' picks are kept (picks for removed questions drop).
 */
export class SaveSeasonPropsCommand implements ISaveSeasonPropsCommand {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly props: ISeasonPropsRepository,
  ) {}

  async execute(payload: SaveSeasonPropsPayload): Promise<void> {
    const league = await this.leagues.findById(payload.leagueId);
    if (!league) throw new NotFoundError("League", payload.leagueId);
    assertLeagueCommissioner(payload.actorUserId, league);

    const props = (await this.props.find(league.leagueId, league.seasonKey)) ?? SeasonProps.empty(league.leagueId, league.seasonKey);
    props.configure(payload.setup);
    await this.props.save(props);
  }
}
