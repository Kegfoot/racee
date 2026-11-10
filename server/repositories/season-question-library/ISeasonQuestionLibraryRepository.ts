import type { SeasonQuestionLibrary } from "@/server/domain/season-question-library";

export interface ISeasonQuestionLibraryRepository {
  /** Empty library when the admins haven't added any questions yet. */
  findByMotorsport(motorsportId: string): Promise<SeasonQuestionLibrary>;
  save(library: SeasonQuestionLibrary): Promise<void>;
}
