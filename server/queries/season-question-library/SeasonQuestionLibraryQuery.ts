import type { IRacerRepository, ISeasonQuestionLibraryRepository } from "@/server/repositories";
import type { ISeasonQuestionLibraryQuery, SeasonQuestionLibraryResult } from "./ISeasonQuestionLibraryQuery";

/** The admins' question library plus the grid names answers can pick from. Unprefixed — spans library and racer repositories. */
export class SeasonQuestionLibraryQuery implements ISeasonQuestionLibraryQuery {
  constructor(
    private readonly libraries: ISeasonQuestionLibraryRepository,
    private readonly racers: IRacerRepository,
  ) {}

  async execute(motorsportId: string): Promise<SeasonQuestionLibraryResult> {
    const [library, racers] = await Promise.all([this.libraries.findByMotorsport(motorsportId), this.racers.findAll()]);
    const grid = racers.filter((r) => r.motorsportId === motorsportId);
    return {
      questions: [...library.questions],
      grid: {
        drivers: grid.map((r) => r.name).sort((a, b) => a.localeCompare(b)),
        teams: [...new Set(grid.map((r) => r.constructorName))].sort((a, b) => a.localeCompare(b)),
      },
    };
  }
}
