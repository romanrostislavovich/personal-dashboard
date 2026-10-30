export const ENGAGEMENT_IDLE_MS = 60_000;
export const ENGAGEMENT_REPORT_MS = 15_000;

export function readingMilliseconds(
  previous: number,
  now: number,
  lastActivity: number,
  visible: boolean,
  focused: boolean,
): number {
  if (
    !visible ||
    !focused ||
    !Number.isFinite(lastActivity) ||
    now - previous > 6000
  ) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(now, lastActivity + ENGAGEMENT_IDLE_MS) -
      Math.max(previous, lastActivity),
  );
}

export function scrollDepth(
  top: number,
  height: number,
  viewport: number,
): number {
  if (
    ![top, height, viewport].every(Number.isFinite) ||
    height <= 0 ||
    viewport <= 0
  ) {
    return 0;
  }
  return Math.min(
    100,
    Math.max(0, ((Math.max(0, top) + viewport) / height) * 100),
  );
}

export interface EngagementReport {
  lease?: string;
  readingSeconds: number;
  scrollDepthPercent: number;
  copyCount: number;
  metadata?: unknown;
}
