import { z } from "zod";
import { blob } from "@/lib/blob";
import { seasonQuestionsPath } from "@/lib/paths";
import { LibraryQuestionSchema, SeasonQuestionLibrary } from "@/server/domain/season-question-library";
import { ParseError, PersistenceError } from "@/server/repositories/errors";
import type { ISeasonQuestionLibraryRepository } from "./ISeasonQuestionLibraryRepository";

const LibraryPersistenceSchema = z.object({
  motorsportId: z.string(),
  questions: z.array(LibraryQuestionSchema),
});

export class BlobSeasonQuestionLibraryRepository implements ISeasonQuestionLibraryRepository {
  async findByMotorsport(motorsportId: string): Promise<SeasonQuestionLibrary> {
    const path = seasonQuestionsPath(motorsportId);
    let raw: unknown;
    try {
      raw = await blob.read<unknown>(path);
    } catch (e) {
      throw new PersistenceError("read", path, e);
    }
    if (raw === null) return SeasonQuestionLibrary.empty(motorsportId);
    try {
      return new SeasonQuestionLibrary(motorsportId, LibraryPersistenceSchema.parse(raw).questions);
    } catch (e) {
      throw new ParseError(path, e);
    }
  }

  async save(library: SeasonQuestionLibrary): Promise<void> {
    const path = seasonQuestionsPath(library.motorsportId);
    try {
      await blob.write(path, { motorsportId: library.motorsportId, questions: library.questions });
    } catch (e) {
      throw new PersistenceError("write", path, e);
    }
  }
}
