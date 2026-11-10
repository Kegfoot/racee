export const LEAGUES_PATH = "leagues.json";
export const RACERS_PATH = "racers.json";
export const MOTORSPORTS_PATH = "motorsports.json";

export function motorsportRacesPath(motorsportId: string) {
  return `motorsports/${motorsportId}/races.json`;
}

export function teamsPath(leagueId: string) {
  return `leagues/${leagueId}/teams.json`;
}

export function racesPath(leagueId: string) {
  return `leagues/${leagueId}/races.json`;
}

export function predictionsPath(leagueId: string, raceId: string) {
  return `leagues/${leagueId}/races/${raceId}/predictions.json`;
}

export function scoresPath(leagueId: string, raceId: string) {
  return `leagues/${leagueId}/races/${raceId}/scores.json`;
}

export function standingsPath(leagueId: string) {
  return `leagues/${leagueId}/standings.json`;
}

export function avatarImagePath(userId: string) {
  return `avatars/${userId}.img`;
}

export function teamLogoPath(leagueId: string, teamId: string) {
  return `team-logos/${leagueId}/${teamId}.img`;
}

export const PHOTO_REPORTS_PATH = "moderation/photo-reports.json";
export const USER_MODERATION_PATH = "moderation/users.json";

export function notificationsPath(userId: string) {
  return `notifications/${userId}.json`;
}

export function leagueHistoryPath(leagueId: string) {
  return `leagues/${leagueId}/history.json`;
}

export const PROFILE_PRIVACY_PATH = "profiles/privacy.json";

export const TROPHY_ART_PATH = "trophies/art.json";

export function trophyArtImagePath(tier: string) {
  return `trophies/${tier}.img`;
}

export function motorsportSeasonsPath(motorsportId: string) {
  return `motorsports/${motorsportId}/seasons.json`;
}

/** The admin-built library of year-long questions for a motorsport (with the correct answers). */
export function seasonQuestionsPath(motorsportId: string) {
  return `motorsports/${motorsportId}/season-questions.json`;
}

/** One league's year-long prop bets for one season: setup, scale and everyone's picks. */
export function seasonPropsPath(leagueId: string, seasonKey: string) {
  return `leagues/${leagueId}/season-props/${seasonKey}.json`;
}
