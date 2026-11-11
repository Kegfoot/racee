import { z } from "zod";
import { InvariantViolationError } from "./errors";

/**
 * A motorsport's seasons as set up by the admins: a name and a start and end
 * date. A race belongs to the season its date falls in. Admins can set up
 * seasons as far ahead as they like; a league only ever sees the season it is
 * linked to, so a future season never leaks into one in progress.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const MotorsportSeasonSchema = z.object({
  seasonId: z.string().uuid(),
  label: z.string().trim().min(1).max(40),
  /** First day of the season, YYYY-MM-DD (inclusive). */
  startDate: z.string().regex(DAY),
  /** Last day of the season, YYYY-MM-DD (inclusive). */
  endDate: z.string().regex(DAY),
  /** When the admins released this season's finale (their half of the two-key release). Null = not yet. */
  finaleReleasedAt: z.string().nullable().default(null),
});
export type MotorsportSeason = z.infer<typeof MotorsportSeasonSchema>;

const day = (date: string) => date.slice(0, 10);

/** The day before `date` (YYYY-MM-DD). */
export function dayBefore(date: string): string {
  const d = new Date(`${day(date)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The day after `date` (YYYY-MM-DD). */
export function dayAfter(date: string): string {
  const d = new Date(`${day(date)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export class MotorsportCalendar {
  private _seasons: MotorsportSeason[];

  static empty(motorsportId: string): MotorsportCalendar {
    return new MotorsportCalendar(motorsportId, []);
  }

  constructor(readonly motorsportId: string, seasons: z.input<typeof MotorsportSeasonSchema>[]) {
    this._seasons = seasons.map(s => MotorsportSeasonSchema.parse(s));
  }

  /** Earliest first. */
  get seasons(): readonly MotorsportSeason[] {
    return [...this._seasons].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  find(seasonId: string): MotorsportSeason | null {
    return this._seasons.find(s => s.seasonId === seasonId) ?? null;
  }

  /** The season a date falls in, if any. */
  seasonOn(date: string): MotorsportSeason | null {
    const d = day(date);
    return this._seasons.find(s => s.startDate <= d && d <= s.endDate) ?? null;
  }

  /** The first season starting after `date`. */
  firstSeasonAfter(date: string): MotorsportSeason | null {
    const d = day(date);
    return this.seasons.find(s => s.startDate > d) ?? null;
  }

  /** The latest season that started on or before `date`. */
  latestSeasonStartedBy(date: string): MotorsportSeason | null {
    const d = day(date);
    const started = this.seasons.filter(s => s.startDate <= d);
    return started[started.length - 1] ?? null;
  }

  /** Adds or updates a season. Seasons can't overlap, and the end can't come before the start. */
  upsert(season: z.input<typeof MotorsportSeasonSchema>): MotorsportSeason {
    // Editing a season's name or dates never un-releases its finale.
    const existing = this.find(String(season.seasonId));
    const parsed = MotorsportSeasonSchema.parse({ ...season, finaleReleasedAt: season.finaleReleasedAt ?? existing?.finaleReleasedAt ?? null });
    if (parsed.endDate < parsed.startDate) throw new InvariantViolationError("The season has to end after it starts");
    const others = this._seasons.filter(s => s.seasonId !== parsed.seasonId);
    const clash = others.find(s => s.startDate <= parsed.endDate && parsed.startDate <= s.endDate);
    if (clash) throw new InvariantViolationError(`Those dates overlap the ${clash.label} season`);
    if (others.some(s => s.label.toLowerCase() === parsed.label.toLowerCase())) {
      throw new InvariantViolationError(`There's already a season called ${parsed.label}`);
    }
    this._seasons = [...others, parsed];
    return parsed;
  }

  /** Admins' half of the finale release: opens it up in every league racing this season (once commissioners release too). */
  setFinaleReleased(seasonId: string, at: string | null): void {
    const season = this.find(seasonId);
    if (!season) throw new InvariantViolationError("That season doesn't exist");
    this._seasons = this._seasons.map(s => (s.seasonId === seasonId ? { ...s, finaleReleasedAt: at } : s));
  }

  remove(seasonId: string): void {
    if (!this.find(seasonId)) throw new InvariantViolationError("That season doesn't exist");
    this._seasons = this._seasons.filter(s => s.seasonId !== seasonId);
  }
}
