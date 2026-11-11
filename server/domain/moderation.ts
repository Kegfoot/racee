import { z } from "zod";
import { PHOTO_STRIKE_LIMIT } from "@/lib/moderation";

export const PhotoTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("avatar"), userId: z.string().min(1) }),
  z.object({ kind: z.literal("teamLogo"), leagueId: z.string().uuid(), teamId: z.string().uuid() }),
]);
export type PhotoTarget = z.infer<typeof PhotoTargetSchema>;

export const PhotoReportSchema = z.object({
  reportId: z.string().uuid(),
  target: PhotoTargetSchema,
  /** The exact picture reported ("upload:<version>") — a newer upload is a different picture. */
  imageVersion: z.string(),
  reporterId: z.string(),
  reason: z.string().max(200).optional(),
  createdAt: z.string(),
  status: z.enum(["open", "removed", "dismissed"]),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
});
export type PhotoReport = z.infer<typeof PhotoReportSchema>;

/** Same picture of the same target (several reports about one photo are reviewed together). */
export function samePhoto(a: { target: PhotoTarget; imageVersion: string }, b: { target: PhotoTarget; imageVersion: string }) {
  if (a.imageVersion !== b.imageVersion || a.target.kind !== b.target.kind) return false;
  return a.target.kind === "avatar"
    ? a.target.userId === (b.target as { userId: string }).userId
    : a.target.teamId === (b.target as { teamId: string }).teamId && a.target.leagueId === (b.target as { leagueId: string }).leagueId;
}

export const UserModerationSchema = z.object({
  userId: z.string(),
  /** Photos of theirs that an admin has removed. */
  strikes: z.number().int().min(0).default(0),
  /** True once strikes reach the limit: no more photo uploads (built-in icons still allowed). */
  uploadsBlocked: z.boolean().default(false),
});
export type UserModeration = z.infer<typeof UserModerationSchema>;

/** Adds a strike and turns off uploads once the limit is reached. */
export function addStrike(m: UserModeration): UserModeration {
  const strikes = m.strikes + 1;
  return { ...m, strikes, uploadsBlocked: m.uploadsBlocked || strikes >= PHOTO_STRIKE_LIMIT };
}

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["photo_removed", "season_ended", "season_started", "season_finale"]),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  read: z.boolean().default(false),
});
export type AppNotification = z.infer<typeof NotificationSchema>;
