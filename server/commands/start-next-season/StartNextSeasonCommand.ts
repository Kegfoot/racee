import type {
  ILeagueHistoryRepository,
  ILeagueRepository,
  ILeagueStandingsRepository,
  IMotorsportCalendarRepository,
  INotificationRepository,
  IRaceRepository,
  ITeamRepository,
  IUserRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
} from "@/server/repositories";
import { loadSeasonBonus } from "@/server/queries/shared/season-bonus";
import { InvariantViolationError, NotFoundError } from "@/server/domain/errors";
import { LeagueStandings } from "@/server/domain/league-standings";
import { Team } from "@/server/domain/team";
import { assertLeagueCommissioner } from "@/server/roles/league";
import { buildSeasonRecord, seasonParticipantIds } from "@/server/services/season-record";
import { nextSeasonWindow } from "@/server/services/season-window";
import type { IStartNextSeasonCommand, StartNextSeasonPayload } from "./IStartNextSeasonCommand";

/**
 * Freezes the ended season into the league's history book — together with a
 * copy of the league's rules and teams as they stood, so "go back" can restore
 * them — then starts the next one from the commissioner's draft: who's in,
 * the team line-up (kept franchises, new teams, deleted teams) and any rule
 * changes. The league moves onto the admins' next motorsport season, or waits
 * for it if it isn't set up yet. Commissioner-only. Unprefixed — spans many repositories.
 */
export class StartNextSeasonCommand implements IStartNextSeasonCommand {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly races: IRaceRepository,
    private readonly standings: ILeagueStandingsRepository,
    private readonly teams: ITeamRepository,
    private readonly users: IUserRepository,
    private readonly history: ILeagueHistoryRepository,
    private readonly notifications: INotificationRepository,
    private readonly calendars: IMotorsportCalendarRepository,
    private readonly seasonProps: ISeasonPropsRepository,
    private readonly seasonQuestions: ISeasonQuestionLibraryRepository,
  ) {}

  async execute(payload: StartNextSeasonPayload): Promise<void> {
    const league = await this.leagues.findById(payload.leagueId);
    if (!league) throw new NotFoundError("League", payload.leagueId);
    assertLeagueCommissioner(payload.actorUserId, league);
    if (!league.isSeasonEnded) throw new InvariantViolationError("End the current season before starting the next one");

    const label = payload.label.trim();
    if (!label) throw new InvariantViolationError("Give the new season a name");

    const [allRaces, standings, teams, history, calendar] = await Promise.all([
      this.races.findAllForMotorsport(league.motorsportId),
      this.standings.findByLeague(league.leagueId),
      this.teams.findAllForLeague(league.leagueId),
      this.history.findByLeague(league.leagueId),
      this.calendars.findByMotorsport(league.motorsportId),
    ]);
    if (history.seasons.some((s) => s.label.toLowerCase() === label.toLowerCase())) {
      throw new InvariantViolationError(`There's already a "${label}" season in this league's history`);
    }

    // ---- who's in ----
    const keepIds = payload.keepUserIds.filter((id) => league.memberIds.includes(id));
    const addIds = [...new Set(payload.addUserIds ?? [])].filter((id) => !league.memberIds.includes(id));
    const added = addIds.length > 0 ? await this.users.findByIds(addIds) : [];
    if (added.length !== addIds.length) throw new InvariantViolationError("One of the added players doesn't have a Racee account");
    const roster = new Set([...keepIds, ...addIds, league.commissionerId]);

    // ---- team line-up ----
    const seen = new Set<string>();
    const names = new Set<string>();
    for (const t of payload.teams) {
      const name = t.name.trim();
      if (!name) throw new InvariantViolationError("Every team needs a name");
      if (names.has(name.toLowerCase())) throw new InvariantViolationError(`Two teams are called "${name}"`);
      names.add(name.toLowerCase());
      if (t.teamId && !teams.some((x) => x.teamId === t.teamId)) throw new NotFoundError("Team", t.teamId);
      for (const id of t.memberIds) {
        if (!roster.has(id)) throw new InvariantViolationError("A team has a player who isn't in the new season");
        if (seen.has(id)) throw new InvariantViolationError("A player can only be on one team");
        seen.add(id);
      }
    }

    const seasonRaces = league.currentSeasonRaces(allRaces);
    const users = await this.users.findByIds(seasonParticipantIds(standings, teams));
    const now = new Date().toISOString();

    // 1. Freeze the finished season, with a copy of the league and teams as they were.
    const bonus = await loadSeasonBonus({ props: this.seasonProps, libraries: this.seasonQuestions }, league, teams, seasonRaces);
    history.addSeason({
      ...buildSeasonRecord({
        bonus,
        seasonId: league.currentSeasonId ?? crypto.randomUUID(),
        label: league.displaySeasonLabel(seasonRaces, now.slice(0, 4)),
        endedAt: league.seasonEndedAt ?? now,
        league,
        races: seasonRaces,
        standings,
        teams,
        namesById: new Map(users.map((u) => [u.userId, u.name])),
      }),
      leagueSnapshot: league.snapshot(),
      teamsSnapshot: teams.map((t) => ({
        teamId: t.teamId,
        name: t.name,
        color: t.color,
        memberIds: [...t.memberIds],
        logo: t.logo,
        logoUploadedBy: t.logoUploadedBy,
        previousTeamIds: [...t.previousTeamIds],
      })),
    });

    // 2. The new season: roster, rules, and the admins' next motorsport season.
    league.startNextSeason({ label, keepUserIds: keepIds, addUserIds: addIds, window: nextSeasonWindow(league, calendar) });
    if (payload.settings && Object.keys(payload.settings).length > 0) league.updateScoringConfig(payload.settings);

    // 3. Teams: update kept franchises, add new ones, delete the rest.
    const keptIds = new Set(payload.teams.flatMap((t) => (t.teamId ? [t.teamId] : [])));
    const nextTeams = payload.teams.map((t) => {
      const team =
        (t.teamId ? teams.find((x) => x.teamId === t.teamId) : undefined) ??
        new Team({ teamId: crypto.randomUUID(), leagueId: league.leagueId, name: t.name.trim(), color: t.color });
      team.rename(t.name.trim());
      if (t.color !== undefined) team.updateColor(t.color);
      for (const id of [...team.memberIds]) team.removeMember(id);
      for (const id of t.memberIds) team.addMember(id);
      team.setPreviousTeams(t.previousTeamIds);
      return team;
    });

    await this.history.save(history);
    await this.leagues.save(league);
    await this.standings.save(LeagueStandings.empty(league.leagueId));
    for (const team of teams) if (!keptIds.has(team.teamId)) await this.teams.remove(league.leagueId, team.teamId);
    await this.teams.saveAll(nextTeams);

    for (const userId of league.memberIds) {
      const isNew = addIds.includes(userId);
      await this.notifications.add(userId, {
        id: crypto.randomUUID(),
        kind: "season_started",
        title: isNew ? `You've been added to ${league.name}` : `${league.name}: the ${label} season is on`,
        body: isNew
          ? `You're in for the ${label} season. Check the standings to see who you're up against.`
          : "You're in for the new season. Last season is saved in the league history on the standings page.",
        createdAt: now,
        read: false,
      });
    }
  }
}
