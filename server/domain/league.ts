import { z } from "zod";
import { InvariantViolationError } from "./errors";

export const PropPointValuesSchema = z.object({
  driverOfDay: z.number().int().min(0),
  lapsLed: z.number().int().min(0),
  fastestPitStop: z.number().int().min(0),
  fastestLap: z.number().int().min(0),
  overAchiever: z.number().int().min(0),
  underAchiever: z.number().int().min(0),
  wrecker: z.number().int().min(0),
});
export type PropPointValues = z.infer<typeof PropPointValuesSchema>;

export const LeaguePropsSchema = z.object({
  leagueId: z.string().uuid(),
  commissionerId: z.string(),
  coCommissionerIds: z.array(z.string()).optional().default([]),
  memberIds: z.array(z.string()).optional().default([]),
  pendingMemberIds: z.array(z.string()).optional().default([]),
  /** Ex-members removed with "keep scores" — they stay visible in the standings. */
  keptScoreUserIds: z.array(z.string()).optional().default([]),
  /** Ring color per player, used for players who aren't on a team. Missing entries are auto-assigned. */
  playerColors: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional().default({}),
  /** Players whose picture the commissioner has hidden in this league (shown as a generic icon). */
  hiddenAvatarUserIds: z.array(z.string()).optional().default([]),
  name: z.string().min(1),
  placementPoints: z.array(z.number().int().min(0)),
  mulliganCount: z.number().int().min(0),
  scoringDepth: z.number().int().min(1).optional(),
  stageCount: z.number().int().min(0).optional(),
  propPointValues: PropPointValuesSchema,
  motorsportId: z.string().uuid(),
  teamPositionPoints: z.array(z.number().min(0)).optional(),
  inviteToken: z.string().nullable().optional().default(null),
  /** Current season's name (e.g. "2027"). Null = named after the year of its first race. */
  seasonLabel: z.string().min(1).nullable().optional().default(null),
  /** Races dated on or before this belong to earlier seasons. Null = no earlier seasons. */
  seasonRacesAfter: z.string().nullable().optional().default(null),
  /** Set when the commissioner ends the season: the last race date it includes. */
  seasonRacesThrough: z.string().nullable().optional().default(null),
  seasonEndedAt: z.string().nullable().optional().default(null),
  /** Id the current season gets in the history book; assigned when it ends so trophy links stay stable. */
  currentSeasonId: z.string().uuid().nullable().optional().default(null),
  /** Private: nobody outside the league can see what happens inside it (only trophies, the name and basic counts). */
  isPrivate: z.boolean().optional().default(false),
  /** The admin-defined motorsport season this league is racing. Null = not linked (yet). */
  motorsportSeasonId: z.string().uuid().nullable().optional().default(null),
  /** Copied from the linked admin season (or a guard against future seasons): races outside these days don't count. */
  seasonWindowStart: z.string().nullable().optional().default(null),
  seasonWindowEnd: z.string().nullable().optional().default(null),
});


export type LeagueProps = z.infer<typeof LeaguePropsSchema>;
type LeagueInput = z.input<typeof LeaguePropsSchema>;

export class League {
  private props: LeagueProps;

  constructor(props: LeagueInput) {
    this.props = LeaguePropsSchema.parse(props);
  }

  get leagueId() { return this.props.leagueId; }
  get commissionerId() { return this.props.commissionerId; }
  get coCommissionerIds(): readonly string[] { return this.props.coCommissionerIds; }
  get name() { return this.props.name; }
  get placementPoints(): readonly number[] { return this.props.placementPoints; }
  get mulliganCount() { return this.props.mulliganCount; }
  get scoringDepth() { return this.props.scoringDepth; }  // undefined means score all positions
  get stageCount() { return this.props.stageCount; }
  get propPointValues(): PropPointValues { return this.props.propPointValues; }
  get motorsportId() { return this.props.motorsportId; }
  get memberIds(): readonly string[] { return this.props.memberIds; }
  get pendingMemberIds(): readonly string[] { return this.props.pendingMemberIds; }
  get keptScoreUserIds(): readonly string[] { return this.props.keptScoreUserIds; }
  get playerColors(): Readonly<Record<string, string>> { return this.props.playerColors; }
  get hiddenAvatarUserIds(): readonly string[] { return this.props.hiddenAvatarUserIds; }
  get teamPositionPoints(): readonly number[] | undefined { return this.props.teamPositionPoints; }
  get inviteToken(): string | null { return this.props.inviteToken; }
  get seasonLabel(): string | null { return this.props.seasonLabel; }
  get seasonRacesAfter(): string | null { return this.props.seasonRacesAfter; }
  get seasonRacesThrough(): string | null { return this.props.seasonRacesThrough; }
  get seasonEndedAt(): string | null { return this.props.seasonEndedAt; }
  get isSeasonEnded(): boolean { return this.props.seasonEndedAt !== null; }
  /** "current" until the season ends, then the id it will keep in the history book. */
  get currentSeasonKey(): string { return this.props.currentSeasonId ?? "current"; }
  get currentSeasonId(): string | null { return this.props.currentSeasonId; }
  /** Identifies the season in progress for things stored per season (stable through end / reopen, new for each next season). */
  get seasonKey(): string { return this.props.seasonRacesAfter ? `after-${this.props.seasonRacesAfter.slice(0, 10)}` : "first"; }
  get isPrivate(): boolean { return this.props.isPrivate; }
  get motorsportSeasonId(): string | null { return this.props.motorsportSeasonId; }
  get seasonWindowStart(): string | null { return this.props.seasonWindowStart; }
  get seasonWindowEnd(): string | null { return this.props.seasonWindowEnd; }

  /**
   * Points the league at an admin season (or, with `seasonId` null, just fences
   * it off with a date window). The window is what actually limits races.
   */
  setSeasonWindow(seasonId: string | null, start: string | null, end: string | null): void {
    this.props = LeaguePropsSchema.parse({
      ...this.props,
      motorsportSeasonId: seasonId,
      seasonWindowStart: start,
      seasonWindowEnd: end,
    });
  }

  /** A full copy of the league's stored fields (kept with a season so "go back" can restore it exactly). */
  snapshot(): LeagueProps {
    return structuredClone(this.props);
  }

  /** Puts back a snapshot taken with snapshot(); anyone who joined since stays a member. */
  restoreSnapshot(snapshot: unknown): void {
    const restored = LeaguePropsSchema.parse(snapshot);
    if (restored.leagueId !== this.props.leagueId) throw new InvariantViolationError("That snapshot is from a different league");
    this.props = LeaguePropsSchema.parse({
      ...restored,
      memberIds: [...new Set([...restored.memberIds, ...this.props.memberIds])],
      pendingMemberIds: this.props.pendingMemberIds.filter(id => !restored.memberIds.includes(id)),
      inviteToken: this.props.inviteToken,
      playerColors: { ...restored.playerColors, ...this.props.playerColors },
    });
  }

  setPrivate(isPrivate: boolean): void {
    this.props = { ...this.props, isPrivate };
  }

  /** Members and commissioners can see inside the league; for a private league, nobody else can. */
  canBeSeenInsideBy(userId: string): boolean {
    return !this.props.isPrivate || this.isMember(userId) || this.canManage(userId);
  }

  /** True if a race on this date belongs to the league's current season. */
  includesRaceDate(date: string): boolean {
    const day = date.slice(0, 10);
    if (this.props.seasonWindowStart && day < this.props.seasonWindowStart.slice(0, 10)) return false;
    if (this.props.seasonWindowEnd && day > this.props.seasonWindowEnd.slice(0, 10)) return false;
    if (this.props.seasonRacesAfter && day <= this.props.seasonRacesAfter.slice(0, 10)) return false;
    if (this.props.seasonRacesThrough && day > this.props.seasonRacesThrough.slice(0, 10)) return false;
    return true;
  }

  /** The current season's races, out of everything on the motorsport's calendar. */
  currentSeasonRaces<T extends { date: string }>(races: readonly T[]): T[] {
    return races.filter(r => this.includesRaceDate(r.date));
  }

  /** The season's display name: its label, else the year of its first race, else `fallbackYear`. */
  displaySeasonLabel(seasonRaces: readonly { date: string }[], fallbackYear: string): string {
    if (this.props.seasonLabel) return this.props.seasonLabel;
    const first = [...seasonRaces].map(r => r.date).sort()[0];
    return first ? first.slice(0, 4) : fallbackYear;
  }

  /** Ends the season after its last counted race. Later races on the calendar no longer count. */
  endSeason(lastRaceDate: string | null, now: string, seasonId: string): void {
    if (this.isSeasonEnded) throw new InvariantViolationError("This season has already ended");
    this.props = LeaguePropsSchema.parse({
      ...this.props,
      seasonEndedAt: now,
      seasonRacesThrough: lastRaceDate ?? now.slice(0, 10),
      currentSeasonId: this.props.currentSeasonId ?? seasonId,
    });
  }

  /** Undoes endSeason, as long as the next season hasn't started. */
  reopenSeason(): void {
    if (!this.isSeasonEnded) throw new InvariantViolationError("This season hasn't ended");
    this.props = { ...this.props, seasonEndedAt: null, seasonRacesThrough: null };
  }

  /**
   * Starts the next season: only races after the ended season's last race count,
   * and only the players carried over stay members. The commissioner always stays.
   */
  startNextSeason(opts: {
    label: string;
    keepUserIds: readonly string[];
    /** People joining for the new season. */
    addUserIds?: readonly string[];
    /** The admin season it races (seasonId null = not set up by the admins yet). */
    window?: { seasonId: string | null; start: string | null; end: string | null };
  }): void {
    if (!this.isSeasonEnded) throw new InvariantViolationError("End the current season before starting the next one");
    const keep = new Set([...opts.keepUserIds, ...(opts.addUserIds ?? []), this.props.commissionerId]);
    const members = [...new Set([...this.props.memberIds.filter(id => keep.has(id)), ...(opts.addUserIds ?? [])])];
    this.props = LeaguePropsSchema.parse({
      ...this.props,
      seasonLabel: opts.label,
      seasonRacesAfter: this.props.seasonRacesThrough,
      seasonRacesThrough: null,
      seasonEndedAt: null,
      currentSeasonId: null,
      motorsportSeasonId: opts.window ? opts.window.seasonId : this.props.motorsportSeasonId,
      seasonWindowStart: opts.window ? opts.window.start : this.props.seasonWindowStart,
      seasonWindowEnd: opts.window ? opts.window.end : this.props.seasonWindowEnd,
      memberIds: members,
      pendingMemberIds: this.props.pendingMemberIds.filter(id => !members.includes(id)),
      coCommissionerIds: this.props.coCommissionerIds.filter(id => keep.has(id)),
      keptScoreUserIds: [],
    });
  }

  /**
   * Undoes startNextSeason: puts the league back to its ended previous season
   * (from the history book's record of it) and brings its players back.
   */
  restorePreviousSeason(opts: {
    label: string;
    racesAfter: string | null;
    racesThrough: string;
    endedAt: string;
    seasonId: string;
    memberIds: readonly string[];
  }): void {
    if (this.isSeasonEnded) throw new InvariantViolationError("Reopen this season before going back to the last one");
    if (this.props.seasonRacesAfter === null) throw new InvariantViolationError("This league has no earlier season to go back to");
    this.props = LeaguePropsSchema.parse({
      ...this.props,
      seasonLabel: opts.label,
      seasonRacesAfter: opts.racesAfter,
      seasonRacesThrough: opts.racesThrough,
      seasonEndedAt: opts.endedAt,
      currentSeasonId: opts.seasonId,
      memberIds: [...new Set([...this.props.memberIds, ...opts.memberIds])],
      pendingMemberIds: this.props.pendingMemberIds.filter(id => !opts.memberIds.includes(id)),
    });
  }

  generateInviteToken(): string {
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    this.props = { ...this.props, inviteToken: token };
    return token;
  }

  deactivateInviteToken(): void {
    this.props = { ...this.props, inviteToken: null };
  }

  isMember(userId: string): boolean {
    return this.props.memberIds.includes(userId);
  }

  isPending(userId: string): boolean {
    return this.props.pendingMemberIds.includes(userId);
  }

  addMember(userId: string): void {
    if (!this.props.memberIds.includes(userId)) {
      this.props = { ...this.props, memberIds: [...this.props.memberIds, userId] };
    }
  }

  addToPending(userId: string): void {
    if (this.isMember(userId) || this.isPending(userId)) return;
    this.props = { ...this.props, pendingMemberIds: [...this.props.pendingMemberIds, userId] };
  }

  acceptPending(userId: string): void {
    this.props = {
      ...this.props,
      pendingMemberIds: this.props.pendingMemberIds.filter(id => id !== userId),
    };
    this.addMember(userId);
  }

  denyPending(userId: string): void {
    this.props = {
      ...this.props,
      pendingMemberIds: this.props.pendingMemberIds.filter(id => id !== userId),
    };
  }

  removeMember(userId: string, keepScores = false): void {
    if (userId === this.props.commissionerId) {
      throw new Error("Cannot remove the commissioner from the league — transfer the role first");
    }
    const kept = this.props.keptScoreUserIds.filter(id => id !== userId);
    this.props = {
      ...this.props,
      memberIds: this.props.memberIds.filter(id => id !== userId),
      coCommissionerIds: this.props.coCommissionerIds.filter(id => id !== userId),
      keptScoreUserIds: keepScores ? [...kept, userId] : kept,
    };
  }

  /** True if this user's scores should appear in the standings (current member, or removed with "keep scores"). */
  showsInStandings(userId: string): boolean {
    return this.props.memberIds.includes(userId) || this.props.keptScoreUserIds.includes(userId);
  }

  /** Hands the owning-commissioner role to another current member. The old commissioner stays a regular member. */
  transferCommissioner(newCommissionerId: string): void {
    if (newCommissionerId === this.props.commissionerId) return;
    if (!this.props.memberIds.includes(newCommissionerId)) {
      throw new Error("The new commissioner must be a current member of the league");
    }
    this.props = {
      ...this.props,
      commissionerId: newCommissionerId,
      coCommissionerIds: this.props.coCommissionerIds.filter(id => id !== newCommissionerId),
    };
  }

  rename(name: string): void {
    this.props = LeaguePropsSchema.parse({ ...this.props, name });
  }

  updateScoringConfig(patch: Partial<Omit<LeagueProps, "leagueId" | "name">>): void {
    this.props = LeaguePropsSchema.parse({ ...this.props, ...patch });
  }

  /** Everyone who can appear in this league's standings and lists: members plus kept-score ex-members. */
  get visibleUserIds(): string[] {
    return [...new Set([this.props.commissionerId, ...this.props.memberIds, ...this.props.keptScoreUserIds])];
  }

  /** Stores ring colors for players. Pass the fully-resolved map to lock in auto-assigned colors. */
  setPlayerColors(colors: Record<string, string>): void {
    this.props = LeaguePropsSchema.parse({ ...this.props, playerColors: { ...this.props.playerColors, ...colors } });
  }

  isAvatarHidden(userId: string): boolean {
    return this.props.hiddenAvatarUserIds.includes(userId);
  }

  setAvatarHidden(userId: string, hidden: boolean): void {
    const rest = this.props.hiddenAvatarUserIds.filter(id => id !== userId);
    this.props = { ...this.props, hiddenAvatarUserIds: hidden ? [...rest, userId] : rest };
  }

  canManage(userId: string): boolean {
    return this.props.commissionerId === userId || this.props.coCommissionerIds.includes(userId);
  }

  promoteToCoCommissioner(userId: string): void {
    if (userId === this.props.commissionerId) {
      throw new Error("Cannot promote the commissioner to co-commissioner");
    }
    this.addMember(userId);
    if (this.props.coCommissionerIds.includes(userId)) return;
    this.props = { ...this.props, coCommissionerIds: [...this.props.coCommissionerIds, userId] };
  }

  demoteCoCommissioner(userId: string): void {
    this.props = { ...this.props, coCommissionerIds: this.props.coCommissionerIds.filter(id => id !== userId) };
  }
}
