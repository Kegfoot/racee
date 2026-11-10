import type { SeasonProps, SeasonQuestion } from "@/server/domain/season-props";
import type { LibraryQuestion } from "@/server/domain/season-question-library";
import type { Team } from "@/server/domain/team";

/**
 * Grading for a league's year-long prop bets. Pure functions: callers load the
 * season's props, the admins' library and the teams, then call these.
 */

export type ResolvedAnswer = { answers: string[]; voided: boolean };

/** The correct answer for a question, or null while nobody has entered it yet. */
export function resolveAnswer(question: SeasonQuestion, library: readonly LibraryQuestion[]): ResolvedAnswer | null {
  const source = question.libraryQuestionId
    ? library.find((l) => l.questionId === question.libraryQuestionId)
    : question;
  if (!source) return null;
  if (source.voided) return { answers: [], voided: true };
  return source.answers.length > 0 ? { answers: [...source.answers], voided: false } : null;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Who got a question right, given every player's pick. Players with no pick never score. */
export function correctUsers(
  question: SeasonQuestion,
  answer: ResolvedAnswer,
  picks: ReadonlyMap<string, string>,
): Set<string> {
  const winners = new Set<string>();
  if (answer.voided || answer.answers.length === 0) return winners;
  if (question.kind === "number" && question.numberMode === "closest") {
    const target = Number(answer.answers[0]);
    if (!Number.isFinite(target)) return winners;
    const distances = [...picks].flatMap(([userId, pick]) => {
      const n = Number(pick);
      return Number.isFinite(n) ? [[userId, Math.abs(n - target)] as const] : [];
    });
    if (distances.length === 0) return winners;
    const best = Math.min(...distances.map(([, d]) => d));
    for (const [userId, d] of distances) if (d === best) winners.add(userId);
    return winners;
  }
  for (const [userId, pick] of picks) {
    const right =
      question.kind === "number"
        ? answer.answers.some((a) => Number.isFinite(Number(pick)) && Number(pick) === Number(a))
        : answer.answers.some((a) => norm(a) === norm(pick));
    if (right) winners.add(userId);
  }
  return winners;
}

/** Points the scale gives for `correct` right answers: its highest step at or below that number. */
export function scalePoints(scale: SeasonProps["scale"], correct: number): { driverPoints: number; teamPoints: number } {
  const step = [...scale].filter((s) => s.correct <= correct).sort((a, b) => b.correct - a.correct)[0];
  return step ? { driverPoints: step.driverPoints, teamPoints: step.teamPoints } : { driverPoints: 0, teamPoints: 0 };
}

export type PlayerPropResult = {
  correctScaled: number;
  driverPoints: number;
  teamPoints: number;
  /** questionId → right / wrong / not graded yet (null). */
  byQuestion: Record<string, boolean | null>;
};

export type SeasonPropsGrade = {
  players: Map<string, PlayerPropResult>;
  /** How many questions have an answer (or are thrown out) so far. */
  gradedQuestions: number;
};

export function gradeSeasonProps(props: SeasonProps, library: readonly LibraryQuestion[]): SeasonPropsGrade {
  const players = new Map<string, PlayerPropResult>();
  const result = (userId: string) => {
    let r = players.get(userId);
    if (!r) {
      r = { correctScaled: 0, driverPoints: 0, teamPoints: 0, byQuestion: {} };
      players.set(userId, r);
    }
    return r;
  };
  for (const userId of Object.keys(props.picks)) result(userId);

  let gradedQuestions = 0;
  for (const question of props.questions) {
    const answer = resolveAnswer(question, library);
    if (!answer) {
      for (const r of players.values()) r.byQuestion[question.questionId] = null;
      continue;
    }
    gradedQuestions += 1;
    if (answer.voided) continue;
    const picks = new Map<string, string>();
    for (const [userId, answers] of Object.entries(props.picks)) {
      const pick = answers[question.questionId];
      if (pick !== undefined && pick !== "") picks.set(userId, pick);
    }
    const winners = correctUsers(question, answer, picks);
    for (const [userId, r] of players) {
      const right = winners.has(userId);
      r.byQuestion[question.questionId] = right;
      if (!right) continue;
      if (question.scoring === "scale") r.correctScaled += 1;
      else {
        r.driverPoints += question.flatDriverPoints;
        r.teamPoints += question.flatTeamPoints;
      }
    }
  }
  for (const r of players.values()) {
    const scaled = scalePoints(props.scale, r.correctScaled);
    r.driverPoints += scaled.driverPoints;
    r.teamPoints += scaled.teamPoints;
  }
  return { players, gradedQuestions };
}

/** Do the bonus points count in the standings yet? */
export function pointsRevealed(props: SeasonProps, ctx: { seasonEnded: boolean; racesLeft: number }): boolean {
  if (!props.enabled || !props.open) return false;
  if (ctx.seasonEnded) return true;
  if (props.pointsReveal === "always") return true;
  if (props.pointsReveal === "racesLeft") return ctx.racesLeft <= props.revealRacesLeft;
  return false;
}

/** Can everyone see everyone's picks yet? */
export function picksRevealed(props: SeasonProps, ctx: { today: string; seasonEnded: boolean }): boolean {
  if (ctx.seasonEnded) return true;
  if (props.picksVisible === "seasonEnd") return false;
  return props.isLocked(ctx.today, false);
}

export type SeasonBonus = {
  /** Season bet points per player for the Drivers' Cup. */
  players: Map<string, number>;
  /** Season bet points per team for the Constructors' Cup (each member's team points, added up). */
  teams: Map<string, number>;
  /** False while points are hidden (the maps are then empty). */
  revealed: boolean;
};

export const NO_BONUS: SeasonBonus = { players: new Map(), teams: new Map(), revealed: true };

/** Bonus points to add to the standings: nothing when the league isn't playing season bets, or while hidden. */
export function computeSeasonBonus(args: {
  props: SeasonProps | null;
  library: readonly LibraryQuestion[];
  teams: readonly Team[];
  seasonEnded: boolean;
  racesLeft: number;
}): SeasonBonus {
  const { props } = args;
  if (!props || !props.enabled || !props.open) return NO_BONUS;
  if (!pointsRevealed(props, { seasonEnded: args.seasonEnded, racesLeft: args.racesLeft })) {
    return { players: new Map(), teams: new Map(), revealed: false };
  }
  const grade = gradeSeasonProps(props, args.library);
  const teamOf = new Map<string, string>();
  for (const t of args.teams) for (const id of t.memberIds) teamOf.set(id, t.teamId);
  const players = new Map<string, number>();
  const teams = new Map<string, number>();
  for (const [userId, r] of grade.players) {
    if (r.driverPoints > 0) players.set(userId, r.driverPoints);
    const teamId = teamOf.get(userId);
    if (teamId && r.teamPoints > 0) teams.set(teamId, (teams.get(teamId) ?? 0) + r.teamPoints);
  }
  return { players, teams, revealed: true };
}
