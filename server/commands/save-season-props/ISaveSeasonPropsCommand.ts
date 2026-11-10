import type { SeasonPropsSetup } from "@/server/domain/season-props";

export type SaveSeasonPropsPayload = {
  actorUserId: string;
  leagueId: string;
  setup: SeasonPropsSetup;
};

export interface ISaveSeasonPropsCommand {
  execute(payload: SaveSeasonPropsPayload): Promise<void>;
}
