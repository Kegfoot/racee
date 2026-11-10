import { z } from "zod";
import { adminOnly, authed } from "@/server/rpc/procedures";
import { QuestionKindSchema, ScaleStepSchema, SeasonQuestionSchema } from "@/server/domain/season-props";
import { LibraryQuestionSchema } from "@/server/domain/season-question-library";
import { BlobLeagueRepository } from "@/server/repositories/league/BlobLeagueRepository";
import { BlobRaceRepository } from "@/server/repositories/race/BlobRaceRepository";
import { BlobRacerRepository } from "@/server/repositories/racer/BlobRacerRepository";
import { PrismaUserRepository } from "@/server/repositories/user/PrismaUserRepository";
import { BlobSeasonPropsRepository } from "@/server/repositories/season-props/BlobSeasonPropsRepository";
import { BlobSeasonQuestionLibraryRepository } from "@/server/repositories/season-question-library/BlobSeasonQuestionLibraryRepository";
import { SeasonPropsViewQuery } from "@/server/queries/season-props-view/SeasonPropsViewQuery";
import { SeasonQuestionLibraryQuery } from "@/server/queries/season-question-library/SeasonQuestionLibraryQuery";
import { SaveSeasonPropsCommand } from "@/server/commands/save-season-props/SaveSeasonPropsCommand";
import { SubmitSeasonPicksCommand } from "@/server/commands/submit-season-picks/SubmitSeasonPicksCommand";
import { BlobSaveSeasonQuestionLibraryCommand } from "@/server/commands/save-season-question-library/BlobSaveSeasonQuestionLibraryCommand";

const leagueRepo = new BlobLeagueRepository();
const propsRepo = new BlobSeasonPropsRepository();
const libraryRepo = new BlobSeasonQuestionLibraryRepository();
const racerRepo = new BlobRacerRepository();

const viewQuery = new SeasonPropsViewQuery(leagueRepo, propsRepo, libraryRepo, racerRepo, new BlobRaceRepository(), new PrismaUserRepository());
const libraryQuery = new SeasonQuestionLibraryQuery(libraryRepo, racerRepo);
const saveCommand = new SaveSeasonPropsCommand(leagueRepo, propsRepo);
const submitCommand = new SubmitSeasonPicksCommand(leagueRepo, propsRepo);
const saveLibraryCommand = new BlobSaveSeasonQuestionLibraryCommand(libraryRepo);

const QuestionDTOSchema = SeasonQuestionSchema.extend({
  fromLibrary: z.boolean(),
  answerState: z.enum(["pending", "answered", "voided"]),
  correctAnswers: z.array(z.string()),
});

const ResultSchema = z.object({
  correctScaled: z.number(),
  driverPoints: z.number(),
  teamPoints: z.number(),
  byQuestion: z.record(z.string(), z.boolean().nullable()),
});

const GridSchema = z.object({ drivers: z.array(z.string()), teams: z.array(z.string()) });

const ViewSchema = z.object({
  canManage: z.boolean(),
  enabled: z.boolean(),
  open: z.boolean(),
  locksAt: z.string().nullable(),
  locked: z.boolean(),
  canPick: z.boolean(),
  picksVisible: z.enum(["afterLock", "seasonEnd"]),
  pointsReveal: z.enum(["always", "racesLeft", "seasonEnd"]),
  revealRacesLeft: z.number(),
  pointsRevealed: z.boolean(),
  racesLeft: z.number(),
  seasonEnded: z.boolean(),
  scale: z.array(ScaleStepSchema),
  questions: z.array(QuestionDTOSchema),
  latePickUserIds: z.array(z.string()),
  grid: GridSchema,
  myPicks: z.record(z.string(), z.string()),
  everyone: z
    .array(z.object({ userId: z.string(), name: z.string(), picks: z.record(z.string(), z.string()), result: ResultSchema.nullable() }))
    .nullable(),
  library: z.array(LibraryQuestionSchema),
  members: z.array(z.object({ userId: z.string(), name: z.string() })),
});

const SetupSchema = z.object({
  enabled: z.boolean(),
  open: z.boolean(),
  locksAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  latePickUserIds: z.array(z.string()),
  picksVisible: z.enum(["afterLock", "seasonEnd"]),
  pointsReveal: z.enum(["always", "racesLeft", "seasonEnd"]),
  revealRacesLeft: z.number().int().min(0).max(60),
  scale: z.array(ScaleStepSchema),
  questions: z.array(SeasonQuestionSchema),
});

export const seasonPropsRouter = {
  /** A league's season bets: setup, the player's own picks, and everyone's once revealed. Members only. */
  get: authed
    .input(z.object({ leagueId: z.string().uuid() }))
    .output(ViewSchema)
    .handler(async ({ context, input }) => viewQuery.execute(context.session.user.id, input.leagueId)),

  /** Commissioner: saves the setup for the season in progress. */
  save: authed
    .input(z.object({ leagueId: z.string().uuid(), setup: SetupSchema }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await saveCommand.execute({ actorUserId: context.session.user.id, leagueId: input.leagueId, setup: input.setup });
      return { ok: true as const };
    }),

  /** Player: saves their year-long picks. */
  submitPicks: authed
    .input(z.object({ leagueId: z.string().uuid(), picks: z.record(z.string(), z.string()) }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await submitCommand.execute({ actorUserId: context.session.user.id, leagueId: input.leagueId, picks: input.picks });
      return { ok: true as const };
    }),

  library: {
    /** Admin: the question library (with correct answers) and the grid names. */
    get: adminOnly
      .input(z.object({ motorsportId: z.string().uuid() }))
      .output(z.object({ questions: z.array(LibraryQuestionSchema), grid: GridSchema }))
      .handler(async ({ input }) => libraryQuery.execute(input.motorsportId)),

    /** Admin: saves the whole library. */
    save: adminOnly
      .input(z.object({ motorsportId: z.string().uuid(), questions: z.array(LibraryQuestionSchema) }))
      .output(z.object({ ok: z.literal(true) }))
      .handler(async ({ input }) => {
        await saveLibraryCommand.execute(input);
        return { ok: true as const };
      }),
  },
};

export { QuestionKindSchema };
