package com.personalworld.dashboard.sensors;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the phone's collection keeps between runs, in the app's private storage: where to send
 * (the server and this phone's device token of the Activity section), how far the usage was read,
 * the app still in front, and the notifications and the fixes of the location waiting to be
 * sent.
 */
public final class SensorsStore {

    private static final String PREFS = "phone_sensors";
    /** Notifications kept while the server cannot be reached; the oldest go first. */
    private static final int MAX_QUEUED = 1000;
    /** Fixes kept while the server cannot be reached: three weeks of one every 15 minutes. */
    private static final int MAX_LOCATIONS = 2000;

    private final SharedPreferences prefs;

    public SensorsStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public boolean configured() {
        return !server().isEmpty() && !token().isEmpty();
    }

    public String server() {
        return prefs.getString("server", "");
    }

    public String token() {
        return prefs.getString("token", "");
    }

    public void configure(String server, String token) {
        prefs.edit().putString("server", server).putString("token", token).apply();
    }

    /** Switched off: nothing more is read or sent, and what waited is dropped. */
    public void clear() {
        prefs.edit().clear().apply();
    }

    /** Read up to here; `0` — never: the first run reads the last day. */
    public long cursor() {
        return prefs.getLong("cursor", 0);
    }

    public UsageSpans.Open open() {
        String app = prefs.getString("openApp", null);
        return app == null ? null : new UsageSpans.Open(app, prefs.getLong("openSince", 0));
    }

    public void advance(long cursor, UsageSpans.Open open) {
        SharedPreferences.Editor editor = prefs.edit().putLong("cursor", cursor);
        if (open == null) {
            editor.remove("openApp").remove("openSince");
        } else {
            editor.putString("openApp", open.app).putLong("openSince", open.since);
        }
        editor.apply();
    }

    public void queueNotification(JSONObject notification) {
        queue("notifications", notification, MAX_QUEUED);
    }

    public JSONArray notifications() {
        return queued("notifications");
    }

    /** The first `count` were sent. */
    public void dropNotifications(int count) {
        drop("notifications", count);
    }

    /** A fix of the location to be sent; one no newer than the last kept is not kept again. */
    public synchronized void queueLocation(JSONObject location) throws JSONException {
        long at = location.getLong("at");
        if (at <= prefs.getLong("lastLocationAt", 0)) {
            return;
        }
        queue("locations", location, MAX_LOCATIONS);
        prefs.edit().putLong("lastLocationAt", at).apply();
    }

    public JSONArray locations() {
        return queued("locations");
    }

    public void dropLocations(int count) {
        drop("locations", count);
    }

    /** Asked Android about the location once: asked again, it may not show its question. */
    public boolean askedLocation() {
        return prefs.getBoolean("askedLocation", false);
    }

    public void markAskedLocation() {
        prefs.edit().putBoolean("askedLocation", true).apply();
    }

    private synchronized void queue(String key, JSONObject item, int max) {
        JSONArray queue = queued(key);
        queue.put(item);
        while (queue.length() > max) {
            queue.remove(0);
        }
        prefs.edit().putString(key, queue.toString()).apply();
    }

    private synchronized JSONArray queued(String key) {
        try {
            return new JSONArray(prefs.getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private synchronized void drop(String key, int count) {
        JSONArray queue = queued(key);
        JSONArray left = new JSONArray();
        for (int i = count; i < queue.length(); i++) {
            left.put(queue.opt(i));
        }
        prefs.edit().putString(key, left.toString()).apply();
    }
}
