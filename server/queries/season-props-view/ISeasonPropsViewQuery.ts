import type { ScaleStep, SeasonQuestion } from "@/server/domain/season-props";
import type { LibraryQuestion } from "@/server/domain/season-question-library";

export type SeasonPropsQuestionDTO = SeasonQuestion & {
  fromLibrary: boolean;
  answerState: "pending" | "answered" | "voided";
  /** Filled in once the correct answer is known. */
  correctAnswers: string[];
};

export type SeasonPropsPlayerDTO = {
  userId: string;
  name: string;
  picks: Record<string, string>;
  /** Null while points are hidden. */
  result: { correctScaled: number; driverPoints: number; teamPoints: number; byQuestion: Record<string, boolean | null> } | null;
};

export type SeasonPropsViewResult = {
  canManage: boolean;
  enabled: boolean;
  open: boolean;
  locksAt: string | null;
  locked: boolean;
  canPick: boolean;
  picksVisible: "afterLock" | "seasonEnd";
  pointsReveal: "always" | "racesLeft" | "seasonEnd";
  revealRacesLeft: number;
  pointsRevealed: boolean;
  racesLeft: number;
  seasonEnded: boolean;
  /** The commissioner has released the season finale. */
  finaleReleased: boolean;
  /** The site admins have released it too (always true for leagues not tied to an admin season). */
  finaleAdminReleased: boolean;
  /** The season's last race has started, so the final results are hidden until both releases. */
  lastRaceStarted: boolean;
  scale: ScaleStep[];
  questions: SeasonPropsQuestionDTO[];
  latePickUserIds: string[];
  grid: { drivers: string[]; teams: string[] };
  myPicks: Record<string, string>;
  /** Everyone's picks, or null while they're hidden. */
  everyone: SeasonPropsPlayerDTO[] | null;
  /** Commissioners only: the admins' questions this league can add, and who is in the league. */
  library: LibraryQuestion[];
  members: Array<{ userId: string; name: string }>;
};

export interface ISeasonPropsViewQuery {
  execute(actorUserId: string, leagueId: string): Promise<SeasonPropsViewResult>;
}
