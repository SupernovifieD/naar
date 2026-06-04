import { parseChangelog } from "../scripts/changelog";

export const releases = parseChangelog();
export const latestRelease = releases[0] ?? null;
