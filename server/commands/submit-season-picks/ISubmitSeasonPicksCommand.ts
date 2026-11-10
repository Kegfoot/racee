export type SubmitSeasonPicksPayload = {
  actorUserId: string;
  leagueId: string;
  /** questionId → answer. */
  picks: Record<string, string>;
};

export interface ISubmitSeasonPicksCommand {
  execute(payload: SubmitSeasonPicksPayload): Promise<void>;
}
