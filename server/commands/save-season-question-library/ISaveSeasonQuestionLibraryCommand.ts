import type { LibraryQuestion } from "@/server/domain/season-question-library";

export type SaveSeasonQuestionLibraryPayload = {
  motorsportId: string;
  questions: LibraryQuestion[];
};

export interface ISaveSeasonQuestionLibraryCommand {
  execute(payload: SaveSeasonQuestionLibraryPayload): Promise<void>;
}
