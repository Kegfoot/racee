import type {
  ILeagueRepository,
  IRacerRepository,
  IRaceRepository,
  ISeasonPropsRepository,
  ISeasonQuestionLibraryRepository,
  IUserRepository,
} from "@/server/repositories";
import { NotFoundError } from "@/server/domain/errors";
import { SeasonProps } from "@/server/domain/season-props";
import { assertLeagueMember, isLeagueCommissioner } from "@/server/roles/league";
import { gradeSeasonProps, picksRevealed, pointsRevealed, resolveAnswer } from "@/server/services/season-props";
import type { ISeasonPropsViewQuery, SeasonPropsViewResult } from "./ISeasonPropsViewQuery";

/**
 * Everything the season-bets screens need for one league: the setup, the
 * player's own picks, everyone's picks and points once those are revealed, and
 * (for commissioners) the admins' library and the member list. Unprefixed —
 * spans several repositories.
 */
export class SeasonPropsViewQuery implements ISeasonPropsViewQuery {
  constructor(
    private readonly leagues: ILeagueRepository,
    private readonly props: ISeasonPropsRepository,
    private readonly libraries: ISeasonQuestionLibraryRepository,
    private readonly racers: IRacerRepository,
    private readonly races: IRaceRepository,
    private readonly users: IUserRepository,
  ) {}

  async execute(actorUserId: string, leagueId: string): Promise<SeasonPropsViewResult> {
    const league = await this.leagues.findById(leagueId);
    if (!league) throw new NotFoundError("League", leagueId);
    assertLeagueMember(actorUserId, league);
    const canManage = isLeagueCommissioner(actorUserId, league);

    const [stored, library, racers, races] = await Promise.all([
      this.props.find(league.leagueId, league.seasonKey),
      this.libraries.findByMotorsport(league.motorsportId),
      this.racers.findAll(),
      this.races.findAllForMotorsport(league.motorsportId).then((all) => league.currentSeasonRaces(all)),
    ]);
    const props = stored ?? SeasonProps.empty(league.leagueId, league.seasonKey);
    const today = new Date().toISOString().slice(0, 10);
    const seasonEnded = league.isSeasonEnded;
    const racesLeft = races.filter((r) => r.keySetAt === null && !r.cancelled).length;
    const revealed = pointsRevealed(props, { seasonEnded, racesLeft });
    const picksShown = picksRevealed(props, { today, seasonEnded });

    const grid = racers.filter((r) => r.motorsportId === league.motorsportId);
    const grade = gradeSeasonProps(props, library.questions);

    const people = [...new Set([...league.memberIds, ...Object.keys(props.picks)])];
    const userList = await this.users.findByIds(people);
    const nameOf = new Map(userList.map((u) => [u.userId, u.name]));

    // Only the commissioner's own page needs every question's setup; players see them all anyway (they're answering them).
    const visible = props.enabled && props.open;
    const questions = props.questions.map((q) => {
      const answer = resolveAnswer(q, library.questions);
      return {
        ...q,
        fromLibrary: q.libraryQuestionId !== null,
        answerState: answer ? (answer.voided ? ("voided" as const) : ("answered" as const)) : ("pending" as const),
        correctAnswers: answer?.answers ?? [],
      };
    });

    return {
      canManage,
      enabled: props.enabled,
      open: props.open,
      locksAt: props.locksAt,
      locked: props.isLocked(today, seasonEnded),
      canPick: props.canPick(actorUserId, today, seasonEnded),
      picksVisible: props.picksVisible,
      pointsReveal: props.pointsReveal,
      revealRacesLeft: props.revealRacesLeft,
      pointsRevealed: revealed,
      racesLeft,
      seasonEnded,
      scale: [...props.scale],
      // Players only see questions once the commissioner has pushed them out.
      questions: canManage || visible ? questions : [],
      latePickUserIds: [...props.latePickUserIds],
      grid: {
        drivers: grid.map((r) => r.name).sort((a, b) => a.localeCompare(b)),
        teams: [...new Set(grid.map((r) => r.constructorName))].sort((a, b) => a.localeCompare(b)),
      },
      myPicks: props.picks[actorUserId] ? { ...props.picks[actorUserId] } : {},
      everyone:
        visible && picksShown
          ? Object.keys(props.picks)
              .filter((id) => league.showsInStandings(id))
              .map((userId) => {
                const r = grade.players.get(userId);
                return {
                  userId,
                  name: nameOf.get(userId) ?? "Unknown player",
                  picks: { ...props.picks[userId] },
                  result: revealed && r ? { correctScaled: r.correctScaled, driverPoints: r.driverPoints, teamPoints: r.teamPoints, byQuestion: r.byQuestion } : null,
                };
              })
              .sort((a, b) => a.name.localeCompare(b.name))
          : null,
      library: canManage
        ? library.questions.filter((q) => q.motorsportSeasonId === null || league.motorsportSeasonId === null || q.motorsportSeasonId === league.motorsportSeasonId)
        : [],
      members: canManage
        ? league.memberIds.map((userId) => ({ userId, name: nameOf.get(userId) ?? "Unknown player" })).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    };
  }
}
