import type { LibraryQuestion } from "@/server/domain/season-question-library";

export type SeasonQuestionLibraryResult = {
  questions: LibraryQuestion[];
  /** Names on the season's grid, for "driver" / "team" questions and their answers. */
  grid: { drivers: string[]; teams: string[] };
};

export interface ISeasonQuestionLibraryQuery {
  execute(motorsportId: string): Promise<SeasonQuestionLibraryResult>;
}
