import { z } from "zod";
import { authed, adminOnly } from "@/server/rpc/procedures";
import { LeagueSchema } from "@/lib/schemas";
import {
  MedalCountsSchema,
  MedalDetailSchema,
  SeasonRecordSchema,
} from "@/server/domain/league-history";
import { BlobLeagueRepository } from "@/server/repositories/league/BlobLeagueRepository";
import { BlobRaceRepository } from "@/server/repositories/race/BlobRaceRepository";
import { BlobLeagueStandingsRepository } from "@/server/repositories/league-standings/BlobLeagueStandingsRepository";
import { BlobTeamRepository } from "@/server/repositories/team/BlobTeamRepository";
import { PrismaUserRepository } from "@/server/repositories/user/PrismaUserRepository";
import { BlobLeagueHistoryRepository } from "@/server/repositories/league-history/BlobLeagueHistoryRepository";
import { BlobProfilePrivacyRepository } from "@/server/repositories/profile-privacy/BlobProfilePrivacyRepository";
import { BlobMotorsportCalendarRepository } from "@/server/repositories/motorsport-calendar/BlobMotorsportCalendarRepository";
import { BlobNotificationRepository } from "@/server/repositories/notification/BlobNotificationRepository";
import { NextSeasonSetupQuery } from "@/server/queries/next-season-setup/NextSeasonSetupQuery";
import { LeagueHistoryQuery } from "@/server/queries/league-history/LeagueHistoryQuery";
import { TrophyShelfQuery } from "@/server/queries/trophy-shelf/TrophyShelfQuery";
import { EndSeasonCommand } from "@/server/commands/end-season/EndSeasonCommand";
import { ReopenSeasonCommand } from "@/server/commands/reopen-season/ReopenSeasonCommand";
import { StartNextSeasonCommand } from "@/server/commands/start-next-season/StartNextSeasonCommand";
import { ImportPastSeasonCommand } from "@/server/commands/import-past-season/ImportPastSeasonCommand";
import { BlobDeleteHistorySeasonCommand } from "@/server/commands/delete-history-season/BlobDeleteHistorySeasonCommand";
import { BlobSetProfilePrivacyCommand } from "@/server/commands/set-profile-privacy/BlobSetProfilePrivacyCommand";
import { BlobTrophyArtRepository } from "@/server/repositories/trophy-art/BlobTrophyArtRepository";
import { BlobTrophyArtQuery } from "@/server/queries/trophy-art/BlobTrophyArtQuery";
import { BlobSetTrophyArtCommand } from "@/server/commands/set-trophy-art/BlobSetTrophyArtCommand";
import { BlobSetLeaguePrivateCommand } from "@/server/commands/set-league-private/BlobSetLeaguePrivateCommand";
import { UndoNextSeasonCommand } from "@/server/commands/undo-next-season/UndoNextSeasonCommand";
import { BlobSeasonPropsRepository } from "@/server/repositories/season-props/BlobSeasonPropsRepository";
import { BlobSeasonQuestionLibraryRepository } from "@/server/repositories/season-question-library/BlobSeasonQuestionLibraryRepository";
import { BlobRacePredictionBookRepository } from "@/server/repositories/race-prediction-book/BlobRacePredictionBookRepository";

const leagueRepo = new BlobLeagueRepository();
const raceRepo = new BlobRaceRepository();
const standingsRepo = new BlobLeagueStandingsRepository();
const teamRepo = new BlobTeamRepository();
const userRepo = new PrismaUserRepository();
const historyRepo = new BlobLeagueHistoryRepository();
const privacyRepo = new BlobProfilePrivacyRepository();
const notificationRepo = new BlobNotificationRepository();
const calendarRepo = new BlobMotorsportCalendarRepository();
const seasonPropsRepo = new BlobSeasonPropsRepository();
const seasonQuestionsRepo = new BlobSeasonQuestionLibraryRepository();

const historyQuery = new LeagueHistoryQuery(leagueRepo, raceRepo, standingsRepo, teamRepo, userRepo, historyRepo, seasonPropsRepo, seasonQuestionsRepo);
const shelfQuery = new TrophyShelfQuery(userRepo, leagueRepo, raceRepo, standingsRepo, historyRepo, privacyRepo, seasonPropsRepo, seasonQuestionsRepo);
const nextSeasonSetupQuery = new NextSeasonSetupQuery(leagueRepo, raceRepo, teamRepo, userRepo, historyRepo, calendarRepo);
const endSeasonCommand = new EndSeasonCommand(leagueRepo, raceRepo, notificationRepo);
const bookRepo = new BlobRacePredictionBookRepository();
const reopenSeasonCommand = new ReopenSeasonCommand(leagueRepo, raceRepo, bookRepo, standingsRepo, teamRepo);
const startNextSeasonCommand = new StartNextSeasonCommand(
  leagueRepo, raceRepo, standingsRepo, teamRepo, userRepo, historyRepo, notificationRepo, calendarRepo, seasonPropsRepo, seasonQuestionsRepo,
);
const importPastSeasonCommand = new ImportPastSeasonCommand(leagueRepo, historyRepo);
const deleteHistorySeasonCommand = new BlobDeleteHistorySeasonCommand(historyRepo);
const setProfilePrivacyCommand = new BlobSetProfilePrivacyCommand(privacyRepo);
const trophyArtRepo = new BlobTrophyArtRepository();
const trophyArtQuery = new BlobTrophyArtQuery(trophyArtRepo);
const setTrophyArtCommand = new BlobSetTrophyArtCommand(trophyArtRepo);
const setLeaguePrivateCommand = new BlobSetLeaguePrivateCommand(leagueRepo);
const undoNextSeasonCommand = new UndoNextSeasonCommand(
  leagueRepo, raceRepo, bookRepo, standingsRepo, teamRepo, historyRepo, calendarRepo,
);

const SeasonStatusSchema = z.enum(["complete", "ended", "in_progress"]);
const SeasonDTOSchema = SeasonRecordSchema.omit({ leagueSnapshot: true, teamsSnapshot: true }).extend({ seasonId: z.string(), status: SeasonStatusSchema });

const LeagueHistorySchema = z.object({
  leagueId: z.string(),
  leagueName: z.string(),
  canManage: z.boolean(),
  isPrivate: z.boolean(),
  current: z.object({
    label: z.string(),
    ended: z.boolean(),
    endedAt: z.string().nullable(),
    scoredRaces: z.number(),
    totalRaces: z.number(),
    unscoredRaces: z.number(),
    undoSeasonLabel: z.string().nullable(),
  }),
  seasons: z.array(SeasonDTOSchema),
  members: z.array(z.object({ id: z.string(), name: z.string() })),
});

const MedalSchema = z.enum(["gold", "silver", "bronze"]);
const TrophyShelfSchema = z.object({
  userId: z.string(),
  name: z.string(),
  isSelf: z.boolean(),
  featuredTrophyKeys: z.array(z.string()),
  leagues: z.array(
    z.object({
      leagueId: z.string(),
      name: z.string(),
      viewerIsMember: z.boolean(),
      restricted: z.boolean(),
      hidden: z.boolean(),
      seasons: z.array(
        z.object({
          seasonId: z.string(),
          label: z.string(),
          status: SeasonStatusSchema,
          rank: z.number().nullable(),
          total: z.number().nullable(),
          trophy: MedalSchema.nullable(),
          trophyKey: z.string(),
          trophyHidden: z.boolean(),
          medals: MedalCountsSchema,
          medalDetails: z.array(MedalDetailSchema),
          raceWins: z.number(),
        }),
      ),
    }),
  ),
});

const LeagueIdInput = z.object({ leagueId: z.string().uuid() });
const Ok = z.object({ ok: z.literal(true) });
const MedalCountsInput = z.object({
  gold: z.number().int().min(0),
  silver: z.number().int().min(0),
  bronze: z.number().int().min(0),
});

export const historyRouter = {
  /** A league's seasons, past and current. League members only. */
  get: authed
    .input(LeagueIdInput)
    .output(LeagueHistorySchema)
    .handler(async ({ context, input }) =>
      historyQuery.execute({ actorUserId: context.session.user.id, leagueId: input.leagueId }),
    ),

  /** Same as get, for any league. Site-admin only (past-season import page). */
  adminGet: adminOnly
    .input(LeagueIdInput)
    .output(LeagueHistorySchema)
    .handler(async ({ context, input }) =>
      historyQuery.execute({ actorUserId: context.session.user.id, leagueId: input.leagueId, asAdmin: true }),
    ),

  /** What the next-season draft page starts from. Commissioner-only. */
  nextSeasonSetup: authed
    .input(LeagueIdInput)
    .output(z.object({
      leagueId: z.string(),
      leagueName: z.string(),
      currentLabel: z.string(),
      ended: z.boolean(),
      nextSeason: z.object({ label: z.string(), startDate: z.string(), endDate: z.string() }).nullable(),
      suggestedLabel: z.string(),
      takenLabels: z.array(z.string()),
      members: z.array(z.object({ id: z.string(), name: z.string() })),
      candidates: z.array(z.object({ id: z.string(), name: z.string(), from: z.string() })),
      teams: z.array(z.object({
        teamId: z.string(),
        name: z.string(),
        color: z.string().nullable(),
        memberIds: z.array(z.string()),
        previousTeamIds: z.array(z.string()),
      })),
      pastTeams: z.array(z.object({ teamId: z.string(), name: z.string(), lastSeason: z.string() })),
      settings: LeagueSchema,
    }))
    .handler(async ({ context, input }) =>
      nextSeasonSetupQuery.execute({ actorUserId: context.session.user.id, leagueId: input.leagueId }),
    ),

  /** Ends the current season and awards trophies. Commissioner-only. */
  endSeason: authed
    .input(LeagueIdInput)
    .output(Ok)
    .handler(async ({ context, input }) => {
      await endSeasonCommand.execute({ leagueId: input.leagueId, actorUserId: context.session.user.id });
      return { ok: true as const };
    }),

  /** Undoes endSeason before the next season starts. Commissioner-only. */
  reopenSeason: authed
    .input(LeagueIdInput)
    .output(Ok)
    .handler(async ({ context, input }) => {
      await reopenSeasonCommand.execute({ leagueId: input.leagueId, actorUserId: context.session.user.id });
      return { ok: true as const };
    }),

  /** Saves the ended season to the history book and starts the next. Commissioner-only. */
  startNextSeason: authed
    .input(LeagueIdInput.extend({
      label: z.string().min(1).max(40),
      keepUserIds: z.array(z.string()),
      addUserIds: z.array(z.string()).optional(),
      teams: z.array(z.object({
        teamId: z.string().uuid().nullable(),
        name: z.string().trim().min(1).max(40),
        color: z.string().optional(),
        memberIds: z.array(z.string()),
        previousTeamIds: z.array(z.string()),
      })),
      settings: LeagueSchema.omit({ id: true, name: true, motorsportId: true }).partial().optional(),
    }))
    .output(Ok)
    .handler(async ({ context, input }) => {
      await startNextSeasonCommand.execute({ ...input, actorUserId: context.session.user.id });
      return { ok: true as const };
    }),

  /** Undoes startNextSeason: back to the last season, ended. Commissioner-only. */
  undoNextSeason: authed
    .input(LeagueIdInput)
    .output(Ok)
    .handler(async ({ context, input }) => {
      await undoNextSeasonCommand.execute({ leagueId: input.leagueId, actorUserId: context.session.user.id });
      return { ok: true as const };
    }),

  /** Adds a hand-entered past season to a league's history. Site-admin only. */
  importSeason: adminOnly
    .input(LeagueIdInput.extend({
      label: z.string().min(1).max(40),
      players: z.array(z.object({
        userId: z.string().nullable(),
        name: z.string().min(1),
        rank: z.number().int().min(1).nullable(),
        total: z.number(),
        gross: z.number().nullable(),
        medals: MedalCountsInput,
        raceWins: z.number().int().min(0).nullable(),
        highScore: z.number().nullable(),
      })),
      teams: z.array(z.object({
        teamId: z.string().nullable(),
        name: z.string().min(1),
        rank: z.number().int().min(1).nullable(),
        total: z.number(),
        medals: MedalCountsInput,
        raceWins: z.number().int().min(0).nullable(),
        highScore: z.number().nullable(),
        memberNames: z.array(z.string()),
      })),
    }))
    .output(Ok)
    .handler(async ({ input }) => {
      await importPastSeasonCommand.execute(input);
      return { ok: true as const };
    }),

  /** Removes a season from a league's history. Site-admin only. */
  deleteSeason: adminOnly
    .input(LeagueIdInput.extend({ seasonId: z.string().uuid() }))
    .output(Ok)
    .handler(async ({ input }) => {
      await deleteHistorySeasonCommand.execute(input);
      return { ok: true as const };
    }),

  /** A player's medals and trophies across leagues (privacy applied for other viewers). */
  shelf: authed
    .input(z.object({ userId: z.string() }))
    .output(TrophyShelfSchema)
    .handler(async ({ context, input }) =>
      shelfQuery.execute({ viewerId: context.session.user.id, userId: input.userId }),
    ),

  /** Your trophy-shelf settings: hide/show a league or trophy from other players, or set the front shelf. */
  setHidden: authed
    .input(z.object({
      leagueId: z.string().optional(),
      trophyKey: z.string().optional(),
      hidden: z.boolean().optional(),
      featuredTrophyKeys: z.array(z.string()).max(6).optional(),
    }))
    .output(Ok)
    .handler(async ({ context, input }) => {
      await setProfilePrivacyCommand.execute({ userId: context.session.user.id, ...input });
      return { ok: true as const };
    }),

  /** Which trophy tiers use custom admin-uploaded art. */
  trophyArt: authed
    .output(z.object({ gold: z.string().nullable(), silver: z.string().nullable(), bronze: z.string().nullable() }))
    .handler(async () => trophyArtQuery.execute()),

  /** Uploads or clears the custom picture for one trophy tier. Site-admin only. */
  setTrophyArt: adminOnly
    .input(z.object({ tier: z.enum(["gold", "silver", "bronze"]), dataUrl: z.string().max(500_000).nullable() }))
    .output(Ok)
    .handler(async ({ input }) => {
      await setTrophyArtCommand.execute(input);
      return { ok: true as const };
    }),

  /** Makes a league private (or public). Commissioner-only. */
  setPrivate: authed
    .input(LeagueIdInput.extend({ isPrivate: z.boolean() }))
    .output(Ok)
    .handler(async ({ context, input }) => {
      await setLeaguePrivateCommand.execute({ ...input, actorUserId: context.session.user.id });
      return { ok: true as const };
    }),
};
