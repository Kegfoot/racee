import { z } from "zod";
import { InvariantViolationError } from "./errors";

/**
 * A league's year-long prop bets for one season ("season picks"): the questions
 * the commissioner chose, how they score, when picks lock, when points show,
 * and every player's answers. Stored once per league per season.
 */

/** choice = pick one of the listed options; driver / team = pick from the season's grid; number = type a number. */
export const QuestionKindSchema = z.enum(["choice", "driver", "team", "number"]);
export type QuestionKind = z.infer<typeof QuestionKindSchema>;

export const SeasonQuestionSchema = z.object({
  questionId: z.string().uuid(),
  /** Set when the question came from the admins' library — its correct answer is then entered once by an admin. */
  libraryQuestionId: z.string().uuid().nullable().default(null),
  prompt: z.string().trim().min(1).max(200),
  kind: QuestionKindSchema,
  /** For "choice" questions (driver / team questions list the grid instead). */
  options: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  /** Number questions: only the exact number is right, or the closest guess wins (ties all win). */
  numberMode: z.enum(["exact", "closest"]).default("exact"),
  /** On the league's scale (worth more when you get several right) or flat points of its own. */
  scoring: z.enum(["scale", "flat"]).default("scale"),
  flatDriverPoints: z.number().min(0).max(100000).default(0),
  flatTeamPoints: z.number().min(0).max(100000).default(0),
  /** Custom questions: the commissioner's correct answer(s). Library questions use the admins' answer instead. */
  answers: z.array(z.string()).default([]),
  /** Custom questions: thrown out (nobody scores it, and it doesn't count toward the scale). */
  voided: z.boolean().default(false),
});
export type SeasonQuestion = z.infer<typeof SeasonQuestionSchema>;

export const ScaleStepSchema = z.object({
  /** How many scaled questions a player got right. */
  correct: z.number().int().min(1).max(50),
  driverPoints: z.number().min(0).max(100000).default(0),
  teamPoints: z.number().min(0).max(100000).default(0),
});
export type ScaleStep = z.infer<typeof ScaleStepSchema>;

export const SeasonPropsSchema = z.object({
  leagueId: z.string().uuid(),
  seasonKey: z.string().min(1),
  /** The league is playing season bets at all. */
  enabled: z.boolean().default(false),
  /** The commissioner has pushed the questions out to the players. */
  open: z.boolean().default(false),
  /** First day picks are closed (YYYY-MM-DD). Null = open until the season ends. */
  locksAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  /** Players who may still pick after the lock (commissioner's call, e.g. someone who joined late). */
  latePickUserIds: z.array(z.string()).default([]),
  /** When everyone can see everyone's picks. */
  picksVisible: z.enum(["afterLock", "seasonEnd"]).default("afterLock"),
  /** When the bonus points start counting in the standings. */
  pointsReveal: z.enum(["always", "racesLeft", "seasonEnd"]).default("always"),
  revealRacesLeft: z.number().int().min(0).max(60).default(3),
  scale: z.array(ScaleStepSchema).max(50).default([]),
  questions: z.array(SeasonQuestionSchema).max(40).default([]),
  /** When the commissioner released the season finale (the final standings and video). Only counts if it's after the season ended. */
  finaleReleasedAt: z.string().nullable().default(null),
  /** userId → questionId → answer. */
  picks: z.record(z.string(), z.record(z.string(), z.string())).default({}),
});
export type SeasonPropsData = z.infer<typeof SeasonPropsSchema>;
export type SeasonPropsInput = z.input<typeof SeasonPropsSchema>;

/** The setup a commissioner edits (everything except the picks). */
export type SeasonPropsSetup = Omit<SeasonPropsInput, "leagueId" | "seasonKey" | "picks" | "finaleReleasedAt">;

export class SeasonProps {
  private props: SeasonPropsData;

  static empty(leagueId: string, seasonKey: string): SeasonProps {
    return new SeasonProps({ leagueId, seasonKey });
  }

  constructor(props: SeasonPropsInput) {
    this.props = SeasonPropsSchema.parse(props);
  }

  get leagueId() { return this.props.leagueId; }
  get seasonKey() { return this.props.seasonKey; }
  get enabled() { return this.props.enabled; }
  get open() { return this.props.open; }
  get locksAt() { return this.props.locksAt; }
  get latePickUserIds(): readonly string[] { return this.props.latePickUserIds; }
  get picksVisible() { return this.props.picksVisible; }
  get pointsReveal() { return this.props.pointsReveal; }
  get revealRacesLeft() { return this.props.revealRacesLeft; }
  get scale(): readonly ScaleStep[] { return this.props.scale; }
  get questions(): readonly SeasonQuestion[] { return this.props.questions; }
  get finaleReleasedAt(): string | null { return this.props.finaleReleasedAt; }
  get picks(): Readonly<Record<string, Readonly<Record<string, string>>>> { return this.props.picks; }

  /** Replaces the setup. Picks for questions that were removed are dropped; the rest stay. */
  configure(setup: SeasonPropsSetup): void {
    const parsed = SeasonPropsSchema.parse({ ...this.props, ...setup });
    const questionIds = new Set(parsed.questions.map(q => q.questionId));
    if (questionIds.size !== parsed.questions.length) throw new InvariantViolationError("Two questions share an id");
    const steps = [...parsed.scale].sort((a, b) => a.correct - b.correct);
    if (new Set(steps.map(s => s.correct)).size !== steps.length) {
      throw new InvariantViolationError("The scale lists the same number of correct answers twice");
    }
    const picks: SeasonPropsData["picks"] = {};
    for (const [userId, answers] of Object.entries(parsed.picks)) {
      picks[userId] = Object.fromEntries(Object.entries(answers).filter(([id]) => questionIds.has(id)));
    }
    this.props = { ...parsed, scale: steps, picks };
  }

  /** True once picks have closed (the lock day arrived, or the season ended). */
  isLocked(today: string, seasonEnded: boolean): boolean {
    if (seasonEnded) return true;
    return this.props.locksAt !== null && today >= this.props.locksAt;
  }

  canPick(userId: string, today: string, seasonEnded: boolean): boolean {
    if (!this.props.enabled || !this.props.open) return false;
    if (!this.isLocked(today, seasonEnded)) return true;
    return !seasonEnded && this.props.latePickUserIds.includes(userId);
  }

  /** Saves one player's answers (replacing their earlier ones). Blank answers are dropped. */
  setPicks(userId: string, answers: Readonly<Record<string, string>>): void {
    const clean: Record<string, string> = {};
    for (const q of this.props.questions) {
      const raw = (answers[q.questionId] ?? "").trim();
      if (!raw) continue;
      if (q.kind === "number") {
        if (!Number.isFinite(Number(raw))) throw new InvariantViolationError(`"${q.prompt}" needs a number`);
      } else if (q.kind === "choice" && !q.options.includes(raw)) {
        throw new InvariantViolationError(`"${raw}" isn't one of the options for "${q.prompt}"`);
      }
      clean[q.questionId] = raw;
    }
    this.props = { ...this.props, picks: { ...this.props.picks, [userId]: clean } };
  }

  /** Commissioner's call: may this player still make picks after the lock? */
  setLatePicker(userId: string, allowed: boolean): void {
    const rest = this.props.latePickUserIds.filter(id => id !== userId);
    this.props = { ...this.props, latePickUserIds: allowed ? [...rest, userId] : rest };
  }

  /** Marks the finale as released (the final standings can show). */
  releaseFinale(at: string): void {
    this.props = { ...this.props, finaleReleasedAt: at };
  }

  /** Has the commissioner released this league's finale? */
  isFinaleReleased(): boolean {
    return this.props.finaleReleasedAt !== null;
  }

  removeUser(userId: string): void {
    const { [userId]: _removed, ...rest } = this.props.picks;
    void _removed;
    this.props = { ...this.props, picks: rest, latePickUserIds: this.props.latePickUserIds.filter(id => id !== userId) };
  }
}
