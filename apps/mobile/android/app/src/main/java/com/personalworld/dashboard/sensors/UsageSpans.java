package com.personalworld.dashboard.sensors;

import java.util.ArrayList;
import java.util.List;

/**
 * Android's usage events → spans of time in front, one app at a time: what the Activity section
 * of the dashboard takes from a computer's tracker too. Plain Java, without Android, so it is
 * tested on its own (UsageSpansTest).
 *
 * An app comes to the front (RESUMED) and goes (PAUSED); the screen turning off or locking ends
 * whatever was in front. The app still in front when the events end is counted up to `until`
 * and handed back as `open`, so the next run goes on from there instead of losing the time.
 */
public final class UsageSpans {

    public static final int RESUMED = 1;
    public static final int PAUSED = 2;
    /** The screen went off. */
    public static final int SCREEN_OFF = 16;
    /** The lock screen came up. */
    public static final int LOCKED = 17;

    /** Two spans of one app this close are one (switching screens inside it). */
    static final long JOIN_MS = 2_000;
    /** Shorter than this is a flicker, not use. */
    static final long MIN_MS = 1_000;

    public static final class Event {
        final String app;
        final int type;
        final long at;

        public Event(String app, int type, long at) {
            this.app = app;
            this.type = type;
            this.at = at;
        }
    }

    public static final class Span {
        public final String app;
        public final long start;
        public final long end;

        public Span(String app, long start, long end) {
            this.app = app;
            this.start = start;
            this.end = end;
        }
    }

    /** The app in front when the last run ended, and since when; `null` — none. */
    public static final class Open {
        public final String app;
        public final long since;

        public Open(String app, long since) {
            this.app = app;
            this.since = since;
        }
    }

    public static final class Result {
        public final List<Span> spans;
        public final Open open;

        Result(List<Span> spans, Open open) {
            this.spans = spans;
            this.open = open;
        }
    }

    private UsageSpans() {}

    /** `events` in the order they happened; `ignored` — apps not counted (the home screen). */
    public static Result build(List<Event> events, Open open, long until, java.util.Set<String> ignored) {
        List<Span> spans = new ArrayList<>();
        String app = open == null ? null : open.app;
        long since = open == null ? 0 : open.since;
        for (Event event : events) {
            if (event.at > until) {
                break;
            }
            if (event.type == RESUMED) {
                if (event.app.equals(app)) {
                    continue; // Another screen of the same app.
                }
                if (app != null) {
                    add(spans, app, since, event.at, ignored);
                }
                app = event.app;
                since = event.at;
            } else if ((event.type == PAUSED && event.app.equals(app)) || event.type == SCREEN_OFF || event.type == LOCKED) {
                if (app != null) {
                    add(spans, app, since, event.at, ignored);
                }
                app = null;
            }
        }
        if (app != null && until > since) {
            add(spans, app, since, until, ignored);
            return new Result(spans, new Open(app, until));
        }
        return new Result(spans, null);
    }

    private static void add(List<Span> spans, String app, long start, long end, java.util.Set<String> ignored) {
        if (ignored.contains(app)) {
            return;
        }
        Span last = spans.isEmpty() ? null : spans.get(spans.size() - 1);
        if (last != null && last.app.equals(app) && start - last.end <= JOIN_MS) {
            spans.set(spans.size() - 1, new Span(app, last.start, end));
            return;
        }
        if (end - start >= MIN_MS) {
            spans.add(new Span(app, start, end));
        }
    }
}
