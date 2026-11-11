import type { ILeagueRepository, INotificationRepository, IRaceRepository } from "@/server/repositories";
import { InvariantViolationError, NotFoundError } from "@/server/domain/errors";
import { assertLeagueCommissioner } from "@/server/roles/league";
import type { EndSeasonPayload, IEndSeasonCommand } from "./IEndSeasonCommand";

/**
 * Ends the league's season after its last scored race: trophies go to the final
 * top three, and races later on the calendar stop counting. The season stays
 * live (score fixes still move trophies) until the next season is started.
 * Commissioner-only. Unprefixed — spans the league, race and notification repositories.
 */
export class EndSeasonCommand implements IEndSeasonCommand {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly races: IRaceRepository,
    private readonly notifications: INotificationRepository,
  ) {}

  async execute(payload: EndSeasonPayload): Promise<void> {
    const league = await this.leagues.findById(payload.leagueId);
    if (!league) throw new NotFoundError("League", payload.leagueId);
    assertLeagueCommissioner(payload.actorUserId, league);

    const season = league.currentSeasonRaces(await this.races.findAllForMotorsport(league.motorsportId));
    const scored = season.filter((r) => r.keySetAt !== null && !r.cancelled).map((r) => r.date.slice(0, 10)).sort();
    if (scored.length === 0) throw new InvariantViolationError("No races have been scored this season yet");

    const now = new Date().toISOString();
    league.endSeason(scored[scored.length - 1], now, crypto.randomUUID());
    await this.leagues.save(league);

    const label = league.displaySeasonLabel(season, now.slice(0, 4));
    for (const userId of league.memberIds) {
      await this.notifications.add(userId, {
        id: crypto.randomUUID(),
        kind: "season_ended",
        title: `${league.name}: ${label} season is over`,
        body: "The season is wrapped up. Your commissioner will release the finale once everything is graded, and then you can watch who took home the hardware.",
        createdAt: now,
        read: false,
      });
    }
  }
}
