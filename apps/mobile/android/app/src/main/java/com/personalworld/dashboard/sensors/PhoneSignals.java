package com.personalworld.dashboard.sensors;

import android.Manifest;
import android.app.usage.NetworkStats;
import android.app.usage.NetworkStatsManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.ConnectivityManager;
import android.os.Build;
import android.os.HandlerThread;
import android.provider.CallLog;
import android.provider.MediaStore;
import android.util.Log;
import androidx.core.content.ContextCompat;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The phone's signals read by SensorsWorker every quarter of an hour (docs/telemetry.md, the
 * phone's collectors 1–8): the screen going on and off, steps, calls, photos, mobile data. Each
 * one only when Android allows it; nothing personal leaves the phone — a call is its length and a
 * hash of the number, a photo is its moment, never the picture.
 */
final class PhoneSignals {

    private static final String TAG = "PhoneSignals";
    /** The screen events of Android's usage stats. */
    static final int SCREEN_ON = 15;
    static final int SCREEN_OFF = 16;

    private PhoneSignals() {}

    static String today() {
        return dayOf(System.currentTimeMillis());
    }

    static String dayOf(long millis) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(millis));
    }

    private static boolean granted(Context context, String permission) {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** Collector 1: the screen on and off (from the usage events the worker reads anyway). */
    static void screen(SensorsStore store, int type, long at) {
        if (type == SCREEN_ON || type == SCREEN_OFF) {
            store.queueSignal(type == SCREEN_ON ? "screenOn" : "screenOff", at, null);
        }
    }

    /**
     * Collector 2: steps. The step counter counts since the phone started; the growth since the
     * last run is added to today (a restart starts it from zero again).
     */
    static void steps(Context context, SensorsStore store) {
        SensorManager sensors = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        Sensor counter = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (counter == null || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            && !granted(context, Manifest.permission.ACTIVITY_RECOGNITION))) {
            return;
        }
        Float now = readOnce(sensors, counter);
        if (now == null) {
            return;
        }
        long count = now.longValue();
        long last = store.number("stepsLast");
        boolean known = store.number("stepsKnown") == 1;
        long growth = !known ? 0 : count >= last ? count - last : count;
        store.setNumber("stepsLast", count);
        store.setNumber("stepsKnown", 1);
        if (growth > 0) {
            String day = today();
            store.putDaily(day, "steps", "", store.daily(day, "steps", "") + growth);
        }
    }

    /** One reading of a sensor that answers when listened to (the step counter, the light). */
    static Float readOnce(SensorManager sensors, Sensor sensor) {
        HandlerThread thread = new HandlerThread("phone-sensor");
        thread.start();
        AtomicReference<Float> value = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        SensorEventListener listener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                value.set(event.values[0]);
                done.countDown();
            }

            @Override
            public void onAccuracyChanged(Sensor s, int accuracy) {}
        };
        try {
            sensors.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL,
                new android.os.Handler(thread.getLooper()));
            done.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            sensors.unregisterListener(listener);
            thread.quitSafely();
        }
        return value.get();
    }

    /**
     * Collector 6: calls — when, how long, in or out or missed, and who as a hash of the number
     * with a salt that never leaves the phone (the same person counts once a day; nobody is named).
     */
    static void calls(Context context, SensorsStore store) {
        if (!granted(context, Manifest.permission.READ_CALL_LOG)) {
            return;
        }
        long cursor = store.number("callsCursor");
        if (cursor == 0) {
            cursor = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(1);
        }
        String[] columns = {CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE, CallLog.Calls.NUMBER};
        try (Cursor rows = context.getContentResolver().query(CallLog.Calls.CONTENT_URI, columns,
            CallLog.Calls.DATE + " > ?", new String[] {String.valueOf(cursor)}, CallLog.Calls.DATE + " ASC")) {
            if (rows == null) {
                return;
            }
            long last = cursor;
            while (rows.moveToNext()) {
                long at = rows.getLong(0);
                JSONObject data = new JSONObject()
                    .put("seconds", rows.getLong(1))
                    .put("type", callType(rows.getInt(2)))
                    .put("who", hashOf(store, rows.getString(3)));
                store.queueSignal("call", at, data);
                last = Math.max(last, at);
            }
            store.setNumber("callsCursor", last);
        } catch (RuntimeException | JSONException e) {
            Log.w(TAG, "Calls were not read", e);
        }
    }

    private static String callType(int type) {
        switch (type) {
            case CallLog.Calls.INCOMING_TYPE:
                return "in";
            case CallLog.Calls.OUTGOING_TYPE:
                return "out";
            case CallLog.Calls.MISSED_TYPE:
                return "missed";
            default:
                return "other";
        }
    }

    /** Twelve hex digits of SHA-256 of the number and the phone's own salt. */
    private static String hashOf(SensorsStore store, String number) {
        String salt = store.text("callSalt");
        if (salt.isEmpty()) {
            byte[] bytes = new byte[16];
            new SecureRandom().nextBytes(bytes);
            StringBuilder hex = new StringBuilder();
            for (byte b : bytes) {
                hex.append(String.format("%02x", b));
            }
            salt = hex.toString();
            store.setText("callSalt", salt);
        }
        String digits = number == null ? "" : number.replaceAll("[^0-9+]", "");
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                .digest((salt + digits).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 6; i++) {
                hex.append(String.format("%02x", hash[i]));
            }
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            return "";
        }
    }

    /** Collector 7: photos taken — the moment only (where, the server knows from the fixes). */
    static void photos(Context context, SensorsStore store) {
        String permission = Build.VERSION.SDK_INT >= 33
            ? "android.permission.READ_MEDIA_IMAGES"
            : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (!granted(context, permission)) {
            return;
        }
        long cursor = store.number("photosCursor");
        if (cursor == 0) {
            cursor = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(1);
        }
        String[] columns = {MediaStore.Images.Media.DATE_TAKEN, MediaStore.Images.Media.BUCKET_DISPLAY_NAME};
        ContentResolver resolver = context.getContentResolver();
        try (Cursor rows = resolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, columns,
            MediaStore.Images.Media.DATE_TAKEN + " > ?", new String[] {String.valueOf(cursor)},
            MediaStore.Images.Media.DATE_TAKEN + " ASC")) {
            if (rows == null) {
                return;
            }
            long last = cursor;
            while (rows.moveToNext()) {
                long at = rows.getLong(0);
                String bucket = rows.getString(1);
                // Screenshots are counted by the dashboard's own section, not as photos.
                if (bucket == null || !bucket.toLowerCase(Locale.ROOT).contains("screenshot")) {
                    store.queueSignal("photo", at, new JSONObject().put("camera", "Camera".equalsIgnoreCase(bucket)));
                }
                last = Math.max(last, at);
            }
            store.setNumber("photosCursor", last);
        } catch (RuntimeException | JSONException e) {
            Log.w(TAG, "Photos were not read", e);
        }
    }

    /** Collector 8: mobile data of today, per app, and Wi-Fi in all (needs usage access). */
    static void dataUsage(Context context, SensorsStore store) {
        if (!PhoneSensorsPlugin.hasUsageAccess(context)) {
            return;
        }
        NetworkStatsManager stats = (NetworkStatsManager) context.getSystemService(Context.NETWORK_STATS_SERVICE);
        if (stats == null) {
            return;
        }
        Calendar midnight = Calendar.getInstance();
        midnight.set(Calendar.HOUR_OF_DAY, 0);
        midnight.set(Calendar.MINUTE, 0);
        midnight.set(Calendar.SECOND, 0);
        midnight.set(Calendar.MILLISECOND, 0);
        long from = midnight.getTimeInMillis();
        long to = System.currentTimeMillis();
        String day = today();
        try {
            Map<Integer, Long> byUid = new HashMap<>();
            NetworkStats mobile = stats.querySummary(ConnectivityManager.TYPE_MOBILE, null, from, to);
            NetworkStats.Bucket bucket = new NetworkStats.Bucket();
            while (mobile.hasNextBucket()) {
                mobile.getNextBucket(bucket);
                byUid.merge(bucket.getUid(), bucket.getRxBytes() + bucket.getTxBytes(), Long::sum);
            }
            mobile.close();
            PackageManager packages = context.getPackageManager();
            for (Map.Entry<Integer, Long> entry : byUid.entrySet()) {
                String name = packages.getNameForUid(entry.getKey());
                store.putDaily(day, "mobileBytes", name == null ? "uid:" + entry.getKey() : name, entry.getValue());
            }
            NetworkStats.Bucket wifi = stats.querySummaryForDevice(ConnectivityManager.TYPE_WIFI, null, from, to);
            store.putDaily(day, "wifiBytes", "", wifi.getRxBytes() + wifi.getTxBytes());
        } catch (RuntimeException | android.os.RemoteException e) {
            // Some phones want the subscriber's id for mobile data, which an app cannot read.
            Log.w(TAG, "Data usage was not read", e);
        }
    }
}
