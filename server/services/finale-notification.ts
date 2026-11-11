import type { AppNotification } from "@/server/domain/moderation";

/** The notification every member gets when their league's finale opens. */
export function finaleReadyNotification(leagueName: string, now: string): AppNotification {
  return {
    id: crypto.randomUUID(),
    kind: "season_finale",
    title: `${leagueName}: the season finale is ready`,
    body: "The final results are in. Open the standings to watch the finale and see who took home the trophies.",
    createdAt: now,
    read: false,
  };
}
