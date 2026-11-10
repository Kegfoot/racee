import { z } from "zod";
import { authed } from "@/server/rpc/procedures";
import { TeamSchema, UserSchema, PropNameSchema } from "@/lib/schemas";
import { TeamDashboardQuery } from "@/server/queries/team-dashboard/TeamDashboardQuery";
import { BlobLeagueStandingsRepository } from "@/server/repositories/league-standings/BlobLeagueStandingsRepository";
import { BlobRaceRepository } from "@/server/repositories/race/BlobRaceRepository";
import { BlobRacePredictionBookRepository } from "@/server/repositories/race-prediction-book/BlobRacePredictionBookRepository";
import { BlobLeagueRepository } from "@/server/repositories/league/BlobLeagueRepository";
import { BlobTeamRepository } from "@/server/repositories/team/BlobTeamRepository";
import { PrismaUserRepository } from "@/server/repositories/user/PrismaUserRepository";
import { BlobLeagueTeamsQuery } from "@/server/queries/league-teams/BlobLeagueTeamsQuery";
import { CommissionerTeamsQuery } from "@/server/queries/commissioner-teams/CommissionerTeamsQuery";
import { CreateTeamCommand } from "@/server/commands/create-team/CreateTeamCommand";
import { UpdateTeamCommand } from "@/server/commands/update-team/UpdateTeamCommand";
import { DeleteTeamCommand } from "@/server/commands/delete-team/DeleteTeamCommand";
import { JoinTeamCommand } from "@/server/commands/join-team/JoinTeamCommand";
import { SetTeamLogoCommand } from "@/server/commands/set-team-logo/SetTeamLogoCommand";
import { BlobSeasonPropsRepository } from "@/server/repositories/season-props/BlobSeasonPropsRepository";
import { BlobSeasonQuestionLibraryRepository } from "@/server/repositories/season-question-library/BlobSeasonQuestionLibraryRepository";
import { BlobTeamLogoRepository } from "@/server/repositories/team-logo/BlobTeamLogoRepository";
import { BlobUserModerationRepository } from "@/server/repositories/moderation/BlobModerationRepository";

const leagueRepo = new BlobLeagueRepository();
const teamRepo = new BlobTeamRepository();
const userRepo = new PrismaUserRepository();

const leagueTeamsQuery = new BlobLeagueTeamsQuery(teamRepo);
const commissionerTeamsQuery = new CommissionerTeamsQuery(teamRepo, userRepo, leagueRepo);
const teamDashboardQuery = new TeamDashboardQuery(
  leagueRepo,
  teamRepo,
  new BlobLeagueStandingsRepository(),
  new BlobRaceRepository(),
  new BlobRacePredictionBookRepository(),
  userRepo,
  new BlobSeasonPropsRepository(),
  new BlobSeasonQuestionLibraryRepository(),
);

// Mirrors server/queries/team-dashboard/ITeamDashboardQuery.ts.
const PropAccuracyStatSchema = z.object({
  propType: PropNameSchema,
  correct: z.number(),
  total: z.number(),
  accuracy: z.number(),
});
const TeamSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  logo: z.string().nullable(),
  memberCount: z.number(),
  teamPoints: z.number(),
  teamRank: z.number().nullable(),
  avgTeamPointsPerRace: z.number(),
  combinedDriverPoints: z.number(),
  avgDriverPointsPerMember: z.number(),
  propAccuracy: z.number(),
});
const TeamDashboardSchema = z.object({
  teamScoringEnabled: z.boolean(),
  teamCount: z.number(),
  team: TeamSummarySchema.nullable(),
  pointsBehindLeader: z.number(),
  members: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      driverTotal: z.number(),
      driverRank: z.number().nullable(),
      gridPoints: z.number(),
      propPoints: z.number(),
      racesScored: z.number(),
      avgPerRace: z.number(),
      bestRace: z.object({ raceId: z.string(), title: z.string(), points: z.number() }).nullable(),
      teamContribution: z.number(),
      contributionShare: z.number(),
      racesPredicted: z.number(),
      propsCalled: z.number(),
      propAccuracy: z.number(),
      propAccuracyByType: z.array(PropAccuracyStatSchema),
    }),
  ),
  teamPropAccuracyByType: z.array(PropAccuracyStatSchema),
  races: z.array(
    z.object({
      raceId: z.string(),
      title: z.string(),
      label: z.string().nullable(),
      teamPoints: z.number(),
      rankThatRace: z.number().nullable(),
      topMember: z.object({ userId: z.string(), name: z.string(), points: z.number() }).nullable(),
    }),
  ),
  leagueTeams: z.array(TeamSummarySchema),
  leagueAverages: z.object({
    teamPoints: z.number(),
    avgTeamPointsPerRace: z.number(),
    combinedDriverPoints: z.number(),
    avgDriverPointsPerMember: z.number(),
    propAccuracy: z.number(),
  }),
  viewerTeamId: z.string().nullable(),
  canEditLogo: z.boolean(),
});
const createTeamCommand = new CreateTeamCommand(leagueRepo, teamRepo);
const updateTeamCommand = new UpdateTeamCommand(leagueRepo, teamRepo);
const setTeamLogoCommand = new SetTeamLogoCommand(leagueRepo, teamRepo, new BlobTeamLogoRepository(), new BlobUserModerationRepository());
const deleteTeamCommand = new DeleteTeamCommand(leagueRepo, teamRepo);
const joinTeamCommand = new JoinTeamCommand(leagueRepo, teamRepo);

const LeagueIdInput = z.object({ leagueId: z.string().uuid() });

// Mirrors server/queries/commissioner-teams/ICommissionerTeamsQuery.ts's
// CommissionerTeamsResult exactly (TeamSchema already matches CommissionerTeamDTO).
const RosterSchema = z.object({
  teams: z.array(TeamSchema),
  users: z.array(UserSchema),
});

export const teamsRouter = {
  /** Team dashboard: a team's stats, members' contributions, and every team compared. Members only. */
  dashboard: authed
    .input(z.object({ leagueId: z.string().uuid(), teamId: z.string().uuid().nullable() }))
    .output(TeamDashboardSchema)
    .handler(async ({ context, input }) =>
      teamDashboardQuery.execute(input.leagueId, input.teamId, context.session.user.id),
    ),

  /** All teams in a league. */
  list: authed
    .input(LeagueIdInput)
    .output(z.array(TeamSchema))
    .handler(async ({ input }) => leagueTeamsQuery.execute(input.leagueId)),

  /**
   * Teams plus every league member — the commissioner team-management roster.
   * Commissioner-only (asserted inside the query).
   */
  roster: authed
    .input(LeagueIdInput)
    .output(RosterSchema)
    .handler(async ({ context, input }) =>
      commissionerTeamsQuery.execute(input.leagueId, context.session.user.id),
    ),

  /**
   * Creates a team. Deviates from the literal `TeamSchema.omit({memberIds:true})`
   * input in the migration spec by additionally requiring `leagueId` — teams are
   * blob-persisted per league (ITeamRepository is keyed by leagueId), so there's no
   * way to know which league to create into, or which league's commissioner to check,
   * without it.
   */
  create: authed
    .input(TeamSchema.omit({ memberIds: true, logo: true }).extend({ leagueId: z.string().uuid() }))
    .output(TeamSchema)
    .handler(async ({ context, input }) => {
      return await createTeamCommand.execute({
        leagueId: input.leagueId,
        id: input.id,
        name: input.name,
        color: input.color,
        actorUserId: context.session.user.id,
      });
    }),

  /**
   * Updates a team. Deviates from the spec's `{ teamId, patch }` input the same way as
   * `create` — `leagueId` is required to locate the team's blob storage and to run the
   * commissioner check.
   */
  update: authed
    .input(
      z.object({
        leagueId: z.string().uuid(),
        teamId: z.string().uuid(),
        patch: TeamSchema.pick({ name: true, color: true })
          .extend({ previousTeamIds: z.array(z.string()) })
          .partial(),
      }),
    )
    .output(TeamSchema)
    .handler(async ({ context, input }) => {
      return await updateTeamCommand.execute({
        leagueId: input.leagueId,
        teamId: input.teamId,
        patch: input.patch,
        actorUserId: context.session.user.id,
      });
    }),

  /** Uploads a team logo (a small image data URL), or removes it with null. Team members or commissioners. */
  setLogo: authed
    .input(
      z.object({
        leagueId: z.string().uuid(),
        teamId: z.string().uuid(),
        dataUrl: z.string().max(500_000).nullable(),
      }),
    )
    .output(z.object({ logo: z.string().nullable() }))
    .handler(async ({ context, input }) =>
      setTeamLogoCommand.execute({
        leagueId: input.leagueId,
        teamId: input.teamId,
        dataUrl: input.dataUrl,
        actorUserId: context.session.user.id,
      }),
    ),

  /** Deletes a team. Same `leagueId` deviation as `create`/`update`. */
  delete: authed
    .input(z.object({ leagueId: z.string().uuid(), teamId: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await deleteTeamCommand.execute({
        leagueId: input.leagueId,
        teamId: input.teamId,
        actorUserId: context.session.user.id,
      });
      return { ok: true as const };
    }),

  /**
   * Joins the current session user onto a team. `userId` is intentionally NOT part of
   * the input — it's sourced from the session so a member can't join anyone else to a
   * team (the bug in the old POST /api/teams/join route).
   */
  joinTeam: authed
    .input(z.object({ leagueId: z.string().uuid(), teamId: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await joinTeamCommand.execute({
        leagueId: input.leagueId,
        userId: context.session.user.id,
        teamId: input.teamId,
      });
      return { ok: true as const };
    }),
};
