package com.personalworld.dashboard.sensors;

/**
 * Still or on the move, from the fixes alone (no Google services): a fix ~150 m from where the
 * phone stood starts the move — GPS every few seconds, so a route follows the streets — and five
 * minutes within ~50 m end it. Plain Java, tested on its own (MotionModeTest).
 */
public final class MotionMode {

    /** Farther than this from where the phone stood: it left. */
    static final double LEFT_M = 150;
    /** Moving less than this… */
    static final double STAYED_M = 50;
    /** …for this long: it stopped. */
    static final long STOPPED_MS = 5 * 60_000;
    /** A fix less sure than this says nothing about leaving (a cell tower far away). */
    static final double USABLE_ACCURACY_M = 200;

    private boolean moving;
    /** Still: where it stands. Moving: the last fix it had moved from. */
    private double latitude = Double.NaN;
    private double longitude;
    private long lastMovedAt;

    public boolean moving() {
        return moving;
    }

    /** Takes a fix; `true` when the mode changed with it. */
    public boolean onFix(double lat, double lon, double accuracy, long at) {
        if (accuracy > USABLE_ACCURACY_M) {
            return false;
        }
        if (Double.isNaN(latitude)) {
            latitude = lat;
            longitude = lon;
            lastMovedAt = at;
            return false;
        }
        double meters = distanceM(latitude, longitude, lat, lon);
        if (!moving) {
            if (meters > LEFT_M) {
                moving = true;
                moveTo(lat, lon, at);
                return true;
            }
            return false;
        }
        if (meters > STAYED_M) {
            moveTo(lat, lon, at);
            return false;
        }
        if (at - lastMovedAt >= STOPPED_MS) {
            moving = false;
            moveTo(lat, lon, at);
            return true;
        }
        return false;
    }

    private void moveTo(double lat, double lon, long at) {
        latitude = lat;
        longitude = lon;
        lastMovedAt = at;
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
