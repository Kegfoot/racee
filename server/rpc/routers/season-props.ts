import { z } from "zod";
import { adminOnly, authed } from "@/server/rpc/procedures";
import { QuestionKindSchema, ScaleStepSchema, SeasonQuestionSchema } from "@/server/domain/season-props";
import { LibraryQuestionSchema } from "@/server/domain/season-question-library";
import { BlobTeamRepository } from "@/server/repositories/team/BlobTeamRepository";
import { BlobLeagueStandingsRepository } from "@/server/repositories/league-standings/BlobLeagueStandingsRepository";
import { BlobRacePredictionBookRepository } from "@/server/repositories/race-prediction-book/BlobRacePredictionBookRepository";
import { BlobNotificationRepository } from "@/server/repositories/notification/BlobNotificationRepository";
import { LeagueFinaleQuery } from "@/server/queries/league-finale/LeagueFinaleQuery";
import { ReleaseFinaleCommand } from "@/server/commands/release-finale/ReleaseFinaleCommand";
import { SetLateSeasonPickerCommand } from "@/server/commands/set-late-season-picker/SetLateSeasonPickerCommand";
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

const raceRepo = new BlobRaceRepository();
const userRepo = new PrismaUserRepository();
const viewQuery = new SeasonPropsViewQuery(leagueRepo, propsRepo, libraryRepo, racerRepo, raceRepo, userRepo);
const finaleQuery = new LeagueFinaleQuery(
  leagueRepo, raceRepo, new BlobLeagueStandingsRepository(), new BlobTeamRepository(), userRepo,
  new BlobRacePredictionBookRepository(), propsRepo, libraryRepo,
);
const releaseFinaleCommand = new ReleaseFinaleCommand(leagueRepo, propsRepo, libraryRepo, new BlobNotificationRepository());
const lateSeasonPickerCommand = new SetLateSeasonPickerCommand(leagueRepo, propsRepo);
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
  finaleReleased: z.boolean(),
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

const FinaleRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  total: z.number(),
  rank: z.number(),
  color: z.string(),
  subtitle: z.string(),
});
const FinaleMedalRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  gold: z.number(),
  silver: z.number(),
  bronze: z.number(),
});
const FinaleSchema = z.object({
  state: z.enum(["none", "pending", "released", "preview"]),
  leagueId: z.string(),
  leagueName: z.string(),
  seasonLabel: z.string(),
  seasonKey: z.string(),
  drivers: z.array(FinaleRowSchema),
  teams: z.array(FinaleRowSchema),
  teamLogos: z.array(z.object({ id: z.string(), name: z.string(), color: z.string().nullable(), logo: z.string().nullable() })),
  medals: z.object({ players: z.array(FinaleMedalRowSchema), teams: z.array(FinaleMedalRowSchema) }),
  awards: z.array(
    z.object({
      id: z.enum(["highScore", "consistent", "propWizard", "traveler", "hotStreak"]),
      title: z.string(),
      blurb: z.string(),
      winners: z.array(z.object({ id: z.string(), name: z.string(), value: z.string() })),
    }),
  ),
  viewerTeamId: z.string().nullable(),
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

  /** Commissioner: may this player still make season picks after the lock? */
  allowLatePicker: authed
    .input(z.object({ leagueId: z.string().uuid(), userId: z.string(), allowed: z.boolean() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await lateSeasonPickerCommand.execute({ actorUserId: context.session.user.id, ...input });
      return { ok: true as const };
    }),

  /** Commissioner: releases the season finale (needs every season question answered). */
  releaseFinale: authed
    .input(z.object({ leagueId: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await releaseFinaleCommand.execute({ actorUserId: context.session.user.id, leagueId: input.leagueId });
      return { ok: true as const };
    }),

  finale: {
    /** The season finale: players get it once released; commissioners can preview it any time. */
    get: authed
      .input(z.object({ leagueId: z.string().uuid(), preview: z.boolean().optional() }))
      .output(FinaleSchema)
      .handler(async ({ context, input }) =>
        finaleQuery.execute({ actorUserId: context.session.user.id, leagueId: input.leagueId, preview: input.preview }),
      ),

    /** Admin: watch the finale for any league's current standings. */
    adminPreview: adminOnly
      .input(z.object({ leagueId: z.string().uuid() }))
      .output(FinaleSchema)
      .handler(async ({ context, input }) =>
        finaleQuery.execute({ actorUserId: context.session.user.id, leagueId: input.leagueId, preview: true, asAdmin: true }),
      ),
  },

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
