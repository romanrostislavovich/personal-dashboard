import type {WatchHints} from '@pd/contracts';
import {ask} from '../shared/messages';
import {WATCH_REPORT_MS} from '../shared/watch-session';

/*
 * What plays in this frame (the page itself, or a player of another site inside it — the films
 * of most sites play in such a frame): every few seconds while a video plays with sound and is
 * big enough to be watched, a report goes to the background. Only the page itself reads what it
 * says plays; a frame tells only where its video stands. Nothing in a private window.
 */

/** Smaller than this is a preview or an advert in a corner. */
const MIN_WIDTH = 200;
const MIN_HEIGHT = 120;

/** The player's title as the page last showed it (Netflix hides it with its controls). */
let player: {url: string; title?: string; subtitle?: string} = {url: ''};

export function setupWatching(): void {
  if (chrome.extension.inIncognitoContext) {
    return;
  }
  setInterval(() => {
    const top = window === window.top;
    if (top) {
      notePlayer();
    }
    const video = playingVideo();
    if (!video) {
      return;
    }
    void ask({
      type: 'watching',
      report: {
        top,
        positionSeconds: video.currentTime,
        durationSeconds: Number.isFinite(video.duration)
          ? video.duration
          : null,
        hints: top ? watchHints() : null,
      },
    }).catch(() => undefined);
  }, WATCH_REPORT_MS);
}

/** What the page says plays: its titles and its player's own. */
export function watchHints(): WatchHints {
  notePlayer();
  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 300) ||
    undefined;
  const og = document.querySelector<HTMLMetaElement>(
    'meta[property="og:title"]',
  )?.content;
  const samePage = player.url === location.href;
  return {
    pageTitle: document.title.trim().slice(0, 300) || undefined,
    ogTitle: og?.trim().slice(0, 300) || undefined,
    heading: text(document.querySelector('h1')),
    playerTitle: samePage ? player.title : undefined,
    playerSubtitle: samePage ? player.subtitle : undefined,
  };
}

/** The video playing here with sound, the biggest one; `null` — none. */
function playingVideo(): HTMLVideoElement | null {
  let best: {video: HTMLVideoElement; area: number} | null = null;
  for (const video of document.querySelectorAll('video')) {
    if (
      video.paused ||
      video.ended ||
      video.readyState < 2 ||
      video.currentTime <= 0
    ) {
      continue;
    }
    if (video.muted || video.volume === 0) {
      continue;
    }
    const box = video.getBoundingClientRect();
    if (box.width < MIN_WIDTH || box.height < MIN_HEIGHT) {
      continue;
    }
    const area = box.width * box.height;
    if (!best || area > best.area) {
      best = {video, area};
    }
  }
  return best?.video ?? null;
}

/** The players that show their own title: Netflix (with the episode under it), YouTube. */
function notePlayer(): void {
  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 300) ||
    undefined;
  if (player.url !== location.href) {
    player = {url: location.href};
  }
  const netflix = document.querySelector('[data-uia="video-title"]');
  if (netflix) {
    const name = netflix.querySelector('h4');
    const rest = [...netflix.querySelectorAll('span')]
      .map(span => text(span))
      .filter(Boolean);
    player.title = text(name) ?? text(netflix);
    player.subtitle = name ? rest.join(' ') || undefined : undefined;
    return;
  }
  const youtube = document.querySelector(
    'ytd-watch-metadata h1, h1.ytd-watch-metadata',
  );
  if (youtube) {
    player.title = text(youtube);
    player.subtitle = text(
      document.querySelector('ytd-watch-metadata ytd-channel-name a'),
    );
  }
}
