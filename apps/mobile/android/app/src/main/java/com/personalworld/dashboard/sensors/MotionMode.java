package com.personalworld.dashboard.sensors;

import java.util.ArrayDeque;

/**
 * Still or on the move, from the fixes alone (no Google services): a fix ~150 m from where the
 * phone stood starts the move — GPS every few seconds, so a route follows the streets — and five
 * minutes of fixes within ~100 m of their middle end it. Their middle, not the last fix: indoors
 * GPS wanders by tens of metres every few seconds, and measured from the last fix the move never
 * ended — GPS stayed on all day at work. Plain Java, tested on its own (MotionModeTest).
 */
public final class MotionMode {

    /** Farther than this from where the phone stood: it left. */
    static final double LEFT_M = 150;
    /** Fixes all within this of their middle… */
    static final double STAYED_M = 100;
    /** …for this long: it stopped. */
    static final long STOPPED_MS = 5 * 60_000;
    /** A fix less sure than this says nothing about leaving (a cell tower far away). */
    static final double USABLE_ACCURACY_M = 200;

    private static final class Fix {
        final double latitude;
        final double longitude;
        final long at;

        Fix(double latitude, double longitude, long at) {
            this.latitude = latitude;
            this.longitude = longitude;
            this.at = at;
        }
    }

    private boolean moving;
    /** Where the phone stands (while still). */
    private double latitude = Double.NaN;
    private double longitude;
    /** Moving: the last fixes close together, oldest first. */
    private final ArrayDeque<Fix> recent = new ArrayDeque<>();

    public boolean moving() {
        return moving;
    }

    /**
     * The phone's motion sensor says it started moving: on the move now, before any fix tells it
     * (a fix far away comes late with the screen off). `true` when the mode changed.
     */
    public boolean startMoving(long at) {
        if (moving) {
            return false;
        }
        moving = true;
        recent.clear();
        if (!Double.isNaN(latitude)) {
            // It may go nowhere after all: where it stood counts from now.
            recent.addLast(new Fix(latitude, longitude, at));
        }
        return true;
    }

    /** Takes a fix; `true` when the mode changed with it. */
    public boolean onFix(double lat, double lon, double accuracy, long at) {
        if (accuracy > USABLE_ACCURACY_M) {
            return false;
        }
        if (Double.isNaN(latitude)) {
            latitude = lat;
            longitude = lon;
            return false;
        }
        if (!moving) {
            if (distanceM(latitude, longitude, lat, lon) > LEFT_M) {
                moving = true;
                recent.clear();
                recent.addLast(new Fix(lat, lon, at));
                return true;
            }
            return false;
        }
        recent.addLast(new Fix(lat, lon, at));
        // An older fix far from the rest was the way here.
        while (!together()) {
            recent.removeFirst();
        }
        if (at - recent.peekFirst().at >= STOPPED_MS) {
            moving = false;
            double[] middle = middle();
            latitude = middle[0];
            longitude = middle[1];
            recent.clear();
            return true;
        }
        return false;
    }

    /** Whether the recent fixes all lie within STAYED_M of their middle; one alone always does. */
    private boolean together() {
        double[] middle = middle();
        for (Fix fix : recent) {
            if (distanceM(middle[0], middle[1], fix.latitude, fix.longitude) > STAYED_M) {
                return false;
            }
        }
        return true;
    }

    private double[] middle() {
        double lat = 0;
        double lon = 0;
        for (Fix fix : recent) {
            lat += fix.latitude;
            lon += fix.longitude;
        }
        return new double[] { lat / recent.size(), lon / recent.size() };
    }

    /** The distance on the Earth's surface (haversine), meters. */
    static double distanceM(double lat1, double lon1, double lat2, double lon2) {
        double rad = Math.PI / 180;
        double dLat = (lat2 - lat1) * rad;
        double dLon = (lon2 - lon1) * rad;
        double h = Math.pow(Math.sin(dLat / 2), 2)
            + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.pow(Math.sin(dLon / 2), 2);
        return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
    }
}
