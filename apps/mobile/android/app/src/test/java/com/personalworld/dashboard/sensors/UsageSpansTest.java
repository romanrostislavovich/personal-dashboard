package com.personalworld.dashboard.sensors;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import org.junit.Test;

public class UsageSpansTest {

    private static UsageSpans.Event e(String app, int type, long at) {
        return new UsageSpans.Event(app, type, at);
    }

    private static final java.util.Set<String> NONE = Collections.emptySet();

    @Test
    public void oneAppAfterAnotherUntilTheScreenGoesOff() {
        List<UsageSpans.Event> events = Arrays.asList(
            e("instagram", UsageSpans.RESUMED, 0),
            e("instagram", UsageSpans.PAUSED, 60_000),
            e("linkedin", UsageSpans.RESUMED, 60_500),
            e("", UsageSpans.SCREEN_OFF, 120_000)
        );
        UsageSpans.Result result = UsageSpans.build(events, null, 200_000, NONE);
        assertEquals(2, result.spans.size());
        assertEquals("instagram", result.spans.get(0).app);
        assertEquals(60_000, result.spans.get(0).end);
        assertEquals("linkedin", result.spans.get(1).app);
        assertEquals(120_000, result.spans.get(1).end);
        assertNull(result.open);
    }

    @Test
    public void screensInsideOneAppAreOneSpan() {
        List<UsageSpans.Event> events = Arrays.asList(
            e("chrome", UsageSpans.RESUMED, 0),
            e("chrome", UsageSpans.PAUSED, 10_000),
            e("chrome", UsageSpans.RESUMED, 11_000),
            e("chrome", UsageSpans.PAUSED, 30_000)
        );
        UsageSpans.Result result = UsageSpans.build(events, null, 60_000, NONE);
        assertEquals(1, result.spans.size());
        assertEquals(0, result.spans.get(0).start);
        assertEquals(30_000, result.spans.get(0).end);
    }

    @Test
    public void theAppStillInFrontIsCountedAndGoesOnNextTime() {
        UsageSpans.Result first = UsageSpans.build(
            Collections.singletonList(e("youtube", UsageSpans.RESUMED, 0)), null, 900_000, NONE);
        assertEquals(900_000, first.spans.get(0).end);
        assertEquals("youtube", first.open.app);

        UsageSpans.Result next = UsageSpans.build(
            Collections.singletonList(e("youtube", UsageSpans.PAUSED, 1_000_000)), first.open, 1_800_000, NONE);
        assertEquals(1, next.spans.size());
        assertEquals(900_000, next.spans.get(0).start);
        assertEquals(1_000_000, next.spans.get(0).end);
        assertNull(next.open);
    }

    @Test
    public void theHomeScreenAndFlickersAreNotCounted() {
        List<UsageSpans.Event> events = Arrays.asList(
            e("launcher", UsageSpans.RESUMED, 0),
            e("telegram", UsageSpans.RESUMED, 5_000),
            e("maps", UsageSpans.RESUMED, 5_400),
            e("", UsageSpans.LOCKED, 20_000)
        );
        UsageSpans.Result result = UsageSpans.build(events, null, 30_000, new HashSet<>(Collections.singletonList("launcher")));
        assertEquals(1, result.spans.size());
        assertEquals("maps", result.spans.get(0).app);
    }
}
