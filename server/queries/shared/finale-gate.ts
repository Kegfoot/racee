import type { IMotorsportCalendarRepository, ISeasonPropsRepository } from "@/server/repositories";
import type { League } from "@/server/domain/league";
import type { Race } from "@/server/domain/race";
import { finalePhase, lastRaceStarted, type FinalePhase } from "@/server/services/season-finale-gate";

export type FinaleGate = {
  phase: FinalePhase;
  lastRaceStarted: boolean;
  commissionerReleased: boolean;
  /** Leagues not linked to an admin season have no admin half, so it counts as released. */
  adminReleased: boolean;
};

/** Where a league's season finale stands. Shared by every read that hides or shows the final results. */
export async function loadFinaleGate(
  repos: { props: ISeasonPropsRepository; calendars: IMotorsportCalendarRepository },
  league: League,
  seasonRaces: readonly Race[],
  now = new Date(),
): Promise<FinaleGate> {
  const [props, calendar] = await Promise.all([
    repos.props.find(league.leagueId, league.seasonKey),
    league.motorsportSeasonId ? repos.calendars.findByMotorsport(league.motorsportId) : null,
  ]);
  const commissionerReleased = !!props?.isFinaleReleased();
  const adminReleased = calendar && league.motorsportSeasonId ? !!calendar.find(league.motorsportSeasonId)?.finaleReleasedAt : true;
  const started = lastRaceStarted(seasonRaces, now);
  return {
    phase: finalePhase({ lastRaceStarted: started, seasonEnded: league.isSeasonEnded, commissionerReleased, adminReleased }),
    lastRaceStarted: started,
    commissionerReleased,
    adminReleased,
  };
}
