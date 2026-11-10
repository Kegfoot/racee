import type { SeasonProps } from "@/server/domain/season-props";

export interface ISeasonPropsRepository {
  /** Null when the league never set up season bets for that season. */
  find(leagueId: string, seasonKey: string): Promise<SeasonProps | null>;
  save(props: SeasonProps): Promise<void>;
}
