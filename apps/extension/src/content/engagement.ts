import {ask} from '../shared/messages';
import {
  ENGAGEMENT_IDLE_MS,
  ENGAGEMENT_REPORT_MS,
  readingMilliseconds,
  scrollDepth,
} from '../shared/engagement';
import {knowledgeMetadata} from './knowledge-meta';

/** Counts only. Event payloads, selection, clipboard and field values are never read. */
export function setupEngagement(): void {
  if (window.top !== window || chrome.extension.inIncognitoContext) return;
  let lease: string | undefined;
  let lastActivity = -Infinity;
  let previous = performance.now();
  let lastReport = previous - ENGAGEMENT_REPORT_MS;
  let reading = 0;
  let depth = 0;
  let copies = 0;
  let pending = false;
  let generation = 0;
  let url = location.href;
  const foreground = () =>
    document.visibilityState === 'visible' && document.hasFocus();
  const clear = () => {
    lease = undefined;
    reading = depth = copies = 0;
    lastActivity = -Infinity;
    previous = performance.now();
    generation++;
  };
  const editable = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable], [role="textbox"]',
    );
  const activity = (event: Event) => {
    if (!lease || !event.isTrusted || !foreground()) return;
    const now = performance.now();
    if (editable(event.target) || editable(document.activeElement)) {
      lastActivity = -Infinity;
      previous = now;
      return;
    }
    reading += readingMilliseconds(previous, now, lastActivity, true, true);
    previous = now;
    lastActivity = now;
  };
  for (const name of [
    'pointerdown',
    'pointermove',
    'keydown',
    'wheel',
    'touchstart',
  ]) {
    document.addEventListener(name, activity, {passive: true, capture: true});
  }
  document.addEventListener(
    'copy',
    event => {
      activity(event);
      if (
        lease &&
        event.isTrusted &&
        foreground() &&
        !editable(event.target) &&
        !editable(document.activeElement)
      )
        copies = Math.min(1000, copies + 1);
    },
    true,
  );
  window.addEventListener('blur', clear);
  window.addEventListener('pagehide', clear);
  document.addEventListener('visibilitychange', clear);
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'telemetry-reset') clear();
  });
  setInterval(() => {
    const now = performance.now();
    if (url !== location.href) {
      clear();
      url = location.href;
    }
    if (!foreground()) {
      clear();
      return;
    }
    if (lease && !editable(document.activeElement)) {
      reading += readingMilliseconds(previous, now, lastActivity, true, true);
      if (now - lastActivity < ENGAGEMENT_IDLE_MS) {
        depth = Math.max(
          depth,
          scrollDepth(
            window.scrollY,
            document.documentElement.scrollHeight,
            window.innerHeight,
          ),
        );
      }
    }
    previous = now;
    if (pending || now - lastReport < ENGAGEMENT_REPORT_MS) return;
    pending = true;
    lastReport = now;
    const sentGeneration = generation;
    const report = {
      lease,
      readingSeconds: reading / 1000,
      scrollDepthPercent: depth,
      copyCount: copies,
      ...(lease ? {metadata: knowledgeMetadata(document)} : {}),
    };
    lease = undefined;
    reading = depth = copies = 0;
    void ask<{lease: string} | null>({type: 'telemetry-engagement', report})
      .then(answer => {
        if (sentGeneration === generation && foreground())
          lease = answer?.lease;
        previous = performance.now();
        if (!lease) lastActivity = -Infinity;
      })
      .catch(clear)
      .finally(() => {
        pending = false;
      });
  }, 5000);
}
