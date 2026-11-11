export type ReleaseFinalePayload = {
  actorUserId: string;
  leagueId: string;
};

export interface IReleaseFinaleCommand {
  execute(payload: ReleaseFinalePayload): Promise<void>;
}
