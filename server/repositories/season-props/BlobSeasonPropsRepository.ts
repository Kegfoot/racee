import { blob } from "@/lib/blob";
import { seasonPropsPath } from "@/lib/paths";
import { SeasonProps, SeasonPropsSchema } from "@/server/domain/season-props";
import { ParseError, PersistenceError } from "@/server/repositories/errors";
import type { ISeasonPropsRepository } from "./ISeasonPropsRepository";

export class BlobSeasonPropsRepository implements ISeasonPropsRepository {
  async find(leagueId: string, seasonKey: string): Promise<SeasonProps | null> {
    const path = seasonPropsPath(leagueId, seasonKey);
    let raw: unknown;
    try {
      raw = await blob.read<unknown>(path);
    } catch (e) {
      throw new PersistenceError("read", path, e);
    }
    if (raw === null) return null;
    try {
      return new SeasonProps(SeasonPropsSchema.parse(raw));
    } catch (e) {
      throw new ParseError(path, e);
    }
  }

  async save(props: SeasonProps): Promise<void> {
    const path = seasonPropsPath(props.leagueId, props.seasonKey);
    try {
      await blob.write(path, {
        leagueId: props.leagueId,
        seasonKey: props.seasonKey,
        enabled: props.enabled,
        open: props.open,
        locksAt: props.locksAt,
        latePickUserIds: props.latePickUserIds,
        picksVisible: props.picksVisible,
        pointsReveal: props.pointsReveal,
        revealRacesLeft: props.revealRacesLeft,
        finaleReleasedAt: props.finaleReleasedAt,
        scale: props.scale,
        questions: props.questions,
        picks: props.picks,
      });
    } catch (e) {
      throw new PersistenceError("write", path, e);
    }
  }
}
