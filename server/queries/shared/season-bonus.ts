import type { ISeasonPropsRepository, ISeasonQuestionLibraryRepository } from "@/server/repositories";
import type { League } from "@/server/domain/league";
import type { Race } from "@/server/domain/race";
import type { Team } from "@/server/domain/team";
import { computeSeasonBonus, NO_BONUS, type SeasonBonus } from "@/server/services/season-props";

/**
 * Loads a league's season-bet points for the season in progress (nothing when
 * the league isn't playing them, or while they're hidden). Shared by every read
 * that ranks players or teams, so the standings, team pages and trophies agree.
 */
export async function loadSeasonBonus(
  repos: { props: ISeasonPropsRepository; libraries: ISeasonQuestionLibraryRepository },
  league: League,
  teams: readonly Team[],
  seasonRaces: readonly Race[],
): Promise<SeasonBonus> {
  const props = await repos.props.find(league.leagueId, league.seasonKey);
  if (!props || !props.enabled || !props.open) return NO_BONUS;
  const library = await repos.libraries.findByMotorsport(league.motorsportId);
  return computeSeasonBonus({
    props,
    library: library.questions,
    teams,
    seasonEnded: league.isSeasonEnded,
    racesLeft: seasonRaces.filter((r) => r.keySetAt === null && !r.cancelled).length,
  });
}
