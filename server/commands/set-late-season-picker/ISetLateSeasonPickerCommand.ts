export type SetLateSeasonPickerPayload = {
  actorUserId: string;
  leagueId: string;
  userId: string;
  allowed: boolean;
};

export interface ISetLateSeasonPickerCommand {
  execute(payload: SetLateSeasonPickerPayload): Promise<void>;
}
