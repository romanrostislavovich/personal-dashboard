package com.personalworld.dashboard.sensors;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class MotionModeTest {

    private static final double LAT = 52.2297;
    private static final double LON = 21.0122;
    /** About 111 m of latitude. */
    private static final double DEG_111_M = 0.001;
    private static final long MIN = 60_000;

    @Test
    public void fixesAroundOnePlaceAreStill() {
        MotionMode mode = new MotionMode();
        assertFalse(mode.onFix(LAT, LON, 30, 0));
        assertFalse(mode.onFix(LAT + DEG_111_M, LON, 30, MIN));
        assertFalse(mode.moving());
    }

    @Test
    public void aFixFarAwayStartsTheMoveAndFiveMinutesInPlaceEndIt() {
        MotionMode mode = new MotionMode();
        mode.onFix(LAT, LON, 30, 0);
        assertTrue(mode.onFix(LAT + 2 * DEG_111_M, LON, 30, MIN));
        assertTrue(mode.moving());
        // Walking on: still moving.
        assertFalse(mode.onFix(LAT + 3 * DEG_111_M, LON, 10, 2 * MIN));
        assertFalse(mode.onFix(LAT + 3 * DEG_111_M, LON, 10, 4 * MIN));
        assertTrue(mode.moving());
        // Five minutes within 50 m of the last move: stopped.
        assertTrue(mode.onFix(LAT + 3 * DEG_111_M, LON, 10, 7 * MIN));
        assertFalse(mode.moving());
    }

    @Test
    public void gpsWanderingIndoorsEndsTheMove() {
        MotionMode mode = new MotionMode();
        mode.onFix(LAT, LON, 30, 0);
        assertTrue(mode.onFix(LAT + 2 * DEG_111_M, LON, 10, MIN));
        // A GPS fix every 5 seconds, jumping 70 m back and forth across the office.
        long at = MIN;
        boolean stopped = false;
        for (int i = 1; i <= 12 * 6 && !stopped; i++) {
            at += 5_000;
            double off = (i % 2 == 0 ? 0.35 : -0.35) * DEG_111_M;
            stopped = mode.onFix(LAT + 2 * DEG_111_M + off, LON, 10, at);
        }
        assertTrue(stopped);
        assertFalse(mode.moving());
        assertTrue(at - MIN <= 6 * MIN);
    }

    @Test
    public void walkingOnStaysOnTheMove() {
        MotionMode mode = new MotionMode();
        mode.onFix(LAT, LON, 30, 0);
        assertTrue(mode.onFix(LAT + 2 * DEG_111_M, LON, 10, MIN));
        // A slow walk, 5 m in 5 seconds (60 m a minute), for ten minutes.
        for (int i = 1; i <= 10 * 12; i++) {
            mode.onFix(LAT + 2 * DEG_111_M + i * 5 * DEG_111_M / 111, LON, 10, MIN + i * 5_000L);
        }
        assertTrue(mode.moving());
    }

    @Test
    public void aFixFarFromSureDoesNotStartAMove() {
        MotionMode mode = new MotionMode();
        mode.onFix(LAT, LON, 30, 0);
        assertFalse(mode.onFix(LAT + 10 * DEG_111_M, LON, 1500, MIN));
        assertFalse(mode.moving());
    }

    @Test
    public void theMotionSensorStartsTheMoveAndStayingStillEndsIt() {
        MotionMode mode = new MotionMode();
        mode.onFix(LAT, LON, 30, 0);
        assertTrue(mode.startMoving(MIN));
        assertFalse(mode.startMoving(2 * MIN));
        // It went nowhere after all: five minutes later, still.
        assertTrue(mode.onFix(LAT, LON, 10, 7 * MIN));
        assertFalse(mode.moving());
    }
}
