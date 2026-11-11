import { z } from "zod";
import { authed } from "@/server/rpc/procedures";
import { RaceScoreEntrySchema, UserSchema } from "@/lib/schemas";
import { BlobLeagueRepository } from "@/server/repositories/league/BlobLeagueRepository";
import { BlobRaceRepository } from "@/server/repositories/race/BlobRaceRepository";
import { BlobLeagueStandingsRepository } from "@/server/repositories/league-standings/BlobLeagueStandingsRepository";
import { PrismaUserRepository } from "@/server/repositories/user/PrismaUserRepository";
import { BlobTeamRepository } from "@/server/repositories/team/BlobTeamRepository";
import { BlobSeasonPropsRepository } from "@/server/repositories/season-props/BlobSeasonPropsRepository";
import { BlobSeasonQuestionLibraryRepository } from "@/server/repositories/season-question-library/BlobSeasonQuestionLibraryRepository";
import { BlobMotorsportCalendarRepository } from "@/server/repositories/motorsport-calendar/BlobMotorsportCalendarRepository";
import { LeagueStandingsViewQuery } from "@/server/queries/league-standings-view/LeagueStandingsViewQuery";

const standingsViewQuery = new LeagueStandingsViewQuery(
  new BlobLeagueRepository(),
  new BlobRaceRepository(),
  new BlobLeagueStandingsRepository(),
  new PrismaUserRepository(),
  new BlobTeamRepository(),
  new BlobSeasonPropsRepository(),
  new BlobSeasonQuestionLibraryRepository(),
  new BlobMotorsportCalendarRepository(),
);

const DriverRowSchema = z.object({
  userId: z.string(),
  total: z.number(),
  mulliganed: z.number().int().min(0),
  seasonBonus: z.number(),
  rawTotal: z.number(),
  propTotal: z.number(),
  raceScores: z.array(RaceScoreEntrySchema),
});

const ConstructorRowSchema = DriverRowSchema.omit({
  userId: true,
  mulliganed: true,
}).extend({
  teamId: z.string().uuid(),
});

const StandingsViewSchema = z.object({
  gradedRaceIds: z.array(z.string().uuid()),
  stages: z.array(z.array(z.string().uuid())),
  driverRows: z.array(DriverRowSchema),
  constructorRows: z.array(ConstructorRowSchema),
  finalePending: z.boolean(),
  finaleHidden: z.boolean(),
  seasonBetsHidden: z.boolean(),
  usersById: z.record(z.string(), UserSchema),
});

export const standingsRouter = {
  /**
   * The standings page's computed read model for a league. Membership is
   * enforced inside the query (assertLeagueMember) — non-members get
   * FORBIDDEN via the authed middleware's error mapping.
   */
  get: authed
    .input(z.object({ leagueId: z.string().uuid() }))
    .output(StandingsViewSchema)
    .handler(async ({ context, input }) =>
      standingsViewQuery.execute(context.session.user.id, input.leagueId),
    ),
};
