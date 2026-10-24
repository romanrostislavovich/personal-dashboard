import { registerPlugin } from '@capacitor/core';
import { isMobileApp } from './mobile-app';

/** What the home-screen widget of the gentle day shows, already in the user's language. */
export interface GentleWidgetText {
  /** The day it is about (`YYYY-MM-DD`): on another day the widget shows `stale` instead. */
  date: string;
  title: string;
  /** Up to three lines, one under another. */
  lines: string;
  /** For a day that has passed: an invitation to open the app. */
  stale: string;
}

const widget = registerPlugin<{ update(text: GentleWidgetText): Promise<void> }>('GentleWidget');

/**
 * Tells the Android app's home-screen widget (GentleWidgetPlugin in apps/mobile) what to show.
 * Nothing in a browser, nor in an app built before the widget.
 */
export async function showOnGentleWidget(text: GentleWidgetText): Promise<void> {
  if (!isMobileApp()) {
    return;
  }
  try {
    await widget.update(text);
  } catch {
    // An older APK has no widget: nothing to tell.
  }
}
