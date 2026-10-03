/**
 * Rules about a window the tracker applies before anything leaves the computer.
 * The server has the same meeting rule (isMeetingTitle in libs/shared/contracts).
 */

/** Private windows of browsers: Edge "InPrivate", Firefox "Private Browsing", Incognito. */
const PRIVATE_WINDOW =
  /\b(incognito|inprivate|private browsing)\b|инкогнито|приватн(ый|ое) (просмотр|окно)/i;

/** The title is not recorded: a private window, or one of the user's private words is in it. */
export function isPrivateWindow(title: string, privateWords: string[]): boolean {
  const lower = title.toLowerCase();
  return (
    PRIVATE_WINDOW.test(title) || privateWords.some((word) => lower.includes(word.toLowerCase()))
  );
}

const MEETING_TITLES = [
  /^meet\s*[-–—]|google meet/i,
  /zoom (meeting|webinar)/i,
  /\b(meeting|call)\b.*\|\s*microsoft teams/i,
  /(собрание|звонок|вызов).*\|\s*microsoft teams/i,
  /^(telegram\s+)?(call|звонок)$/i,
];

/** A call: a program that is only for calls (Zoom), or a call window of another one. */
export function isMeeting(app: string, title: string, meetingApps: string[]): boolean {
  return (
    meetingApps.includes(app.toLowerCase()) || MEETING_TITLES.some((pattern) => pattern.test(title))
  );
}
