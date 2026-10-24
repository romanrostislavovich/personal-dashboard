package com.personalworld.dashboard.sensors;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the phone's collection keeps between runs, in the app's private storage: where to send
 * (the server and this phone's device token of the Activity section), how far the usage was read,
 * the app still in front, and the notifications waiting to be sent.
 */
public final class SensorsStore {

    private static final String PREFS = "phone_sensors";
    /** Notifications kept while the server cannot be reached; the oldest go first. */
    private static final int MAX_QUEUED = 1000;

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

    public synchronized void queueNotification(JSONObject notification) {
        JSONArray queue = notifications();
        queue.put(notification);
        while (queue.length() > MAX_QUEUED) {
            queue.remove(0);
        }
        prefs.edit().putString("notifications", queue.toString()).apply();
    }

    public synchronized JSONArray notifications() {
        try {
            return new JSONArray(prefs.getString("notifications", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** The first `count` were sent. */
    public synchronized void dropNotifications(int count) {
        JSONArray queue = notifications();
        JSONArray left = new JSONArray();
        for (int i = count; i < queue.length(); i++) {
            left.put(queue.opt(i));
        }
        prefs.edit().putString("notifications", left.toString()).apply();
    }
}
