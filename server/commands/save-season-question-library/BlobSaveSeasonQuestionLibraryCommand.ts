import type { ISeasonQuestionLibraryRepository } from "@/server/repositories";
import type {
  ISaveSeasonQuestionLibraryCommand,
  SaveSeasonQuestionLibraryPayload,
} from "./ISaveSeasonQuestionLibraryCommand";

/** Saves the admins' question library (questions and correct answers) for a motorsport. Site-admin only (enforced at the RPC). */
export class BlobSaveSeasonQuestionLibraryCommand implements ISaveSeasonQuestionLibraryCommand {
  constructor(private readonly libraries: ISeasonQuestionLibraryRepository) {}

  async execute(payload: SaveSeasonQuestionLibraryPayload): Promise<void> {
    const library = await this.libraries.findByMotorsport(payload.motorsportId);
    library.replaceAll(payload.questions);
    await this.libraries.save(library);
  }
}
