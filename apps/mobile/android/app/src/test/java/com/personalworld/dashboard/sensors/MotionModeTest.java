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
    public void aFixFarFromSureDoesNotStartAMove() {
        MotionMode mode = new MotionMode();
        mode.onFix(LAT, LON, 30, 0);
        assertFalse(mode.onFix(LAT + 10 * DEG_111_M, LON, 1500, MIN));
        assertFalse(mode.moving());
    }
}
