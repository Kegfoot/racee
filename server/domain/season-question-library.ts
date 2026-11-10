import { z } from "zod";
import { QuestionKindSchema } from "./season-props";

/**
 * The admins' library of year-long questions for one motorsport. Leagues pick
 * from it when they set up season bets, and the admins enter each question's
 * correct answer once, at the end of the season, so every league using it is
 * graded automatically.
 */
export const LibraryQuestionSchema = z.object({
  questionId: z.string().uuid(),
  /** The admin season this question is for (null = any season). */
  motorsportSeasonId: z.string().uuid().nullable().default(null),
  prompt: z.string().trim().min(1).max(200),
  kind: QuestionKindSchema,
  options: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  /** The correct answer(s); several when there's a tie. Empty = not answered yet. */
  answers: z.array(z.string()).default([]),
  /** Thrown out: nobody scores it. */
  voided: z.boolean().default(false),
});
export type LibraryQuestion = z.infer<typeof LibraryQuestionSchema>;

export class SeasonQuestionLibrary {
  private _questions: LibraryQuestion[];

  static empty(motorsportId: string): SeasonQuestionLibrary {
    return new SeasonQuestionLibrary(motorsportId, []);
  }

  constructor(readonly motorsportId: string, questions: z.input<typeof LibraryQuestionSchema>[]) {
    this._questions = questions.map(q => LibraryQuestionSchema.parse(q));
  }

  get questions(): readonly LibraryQuestion[] { return this._questions; }

  find(questionId: string): LibraryQuestion | undefined {
    return this._questions.find(q => q.questionId === questionId);
  }

  /** Replaces the whole list (the admin page edits it as one). */
  replaceAll(questions: z.input<typeof LibraryQuestionSchema>[]): void {
    const parsed = questions.map(q => LibraryQuestionSchema.parse(q));
    if (new Set(parsed.map(q => q.questionId)).size !== parsed.length) throw new Error("Two questions share an id");
    this._questions = parsed;
  }
}
