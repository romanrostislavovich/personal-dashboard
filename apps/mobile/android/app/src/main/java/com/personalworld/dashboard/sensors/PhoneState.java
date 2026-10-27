package com.personalworld.dashboard.sensors;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.telephony.TelephonyManager;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the phone's state tells, read by SensorsWorker every quarter of an hour (docs/telemetry.md,
 * the phone's collectors 11–13): the next alarm (the sleep one planned), the country of the
 * mobile network (trips, without the GPS), the battery's temperature and health. A change is
 * written down, not every reading — the battery once an hour.
 */
final class PhoneState {

    private static final long BATTERY_EVERY_MS = 60 * 60 * 1000L;

    private PhoneState() {}

    /** Collector 11: the next alarm clock, when it is set, moved or switched off. */
    static void alarm(Context context, SensorsStore store) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        AlarmManager.AlarmClockInfo next = alarms == null ? null : alarms.getNextAlarmClock();
        long at = next == null ? 0 : next.getTriggerTime();
        if (at == store.number("alarmAt") && store.number("alarmKnown") == 1) {
            return;
        }
        store.setNumber("alarmAt", at);
        store.setNumber("alarmKnown", 1);
        try {
            store.queueSignal("alarm", System.currentTimeMillis(),
                new JSONObject().put("at", at == 0 ? JSONObject.NULL : at));
        } catch (JSONException e) {
            // Skipped.
        }
    }

    /** Collector 12: the country of the mobile network (ISO code), when it changes. */
    static void country(Context context, SensorsStore store) {
        TelephonyManager phone = (TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);
        String iso = phone == null ? "" : phone.getNetworkCountryIso();
        if (iso == null || iso.isEmpty()) {
            return; // No network (airplane mode, a basement): nothing is known, nothing changed.
        }
        String country = iso.toLowerCase(Locale.ROOT);
        if (country.equals(store.text("country"))) {
            return;
        }
        store.setText("country", country);
        try {
            store.queueSignal("country", System.currentTimeMillis(), new JSONObject().put("country", country));
        } catch (JSONException e) {
            // Skipped.
        }
    }

    /** Collector 13: the battery once an hour: its level, temperature (°C) and health. */
    static void battery(Context context, SensorsStore store) {
        long now = System.currentTimeMillis();
        if (now - store.number("batteryAt") < BATTERY_EVERY_MS) {
            return;
        }
        // The sticky broadcast holds the last state: nothing is registered.
        Intent state = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (state == null) {
            return;
        }
        int level = state.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = state.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int tenths = state.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
        store.setNumber("batteryAt", now);
        try {
            JSONObject data = new JSONObject()
                .put("level", level < 0 || scale <= 0 ? JSONObject.NULL : Math.round(level * 100f / scale))
                .put("temperature", tenths == Integer.MIN_VALUE ? JSONObject.NULL : tenths / 10.0)
                .put("health", health(state.getIntExtra(BatteryManager.EXTRA_HEALTH, 0)))
                .put("charging", state.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0);
            store.queueSignal("battery", now, data);
        } catch (JSONException e) {
            // Skipped.
        }
    }

    private static String health(int code) {
        switch (code) {
            case BatteryManager.BATTERY_HEALTH_GOOD:
                return "good";
            case BatteryManager.BATTERY_HEALTH_OVERHEAT:
                return "overheat";
            case BatteryManager.BATTERY_HEALTH_DEAD:
                return "dead";
            case BatteryManager.BATTERY_HEALTH_COLD:
                return "cold";
            case BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE:
            case BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE:
                return "failure";
            default:
                return "unknown";
        }
    }
}
