export type AdminReleaseFinalePayload = {
  motorsportId: string;
  seasonId: string;
  /** false takes the admins' release back. */
  release: boolean;
};

export interface IAdminReleaseFinaleCommand {
  execute(payload: AdminReleaseFinalePayload): Promise<void>;
}
