package com.personalworld.dashboard.sensors;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.location.Location;
import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Every 15 minutes (the least Android allows), in the background: the time in apps since the
 * last run goes to the Activity section as this phone's spans, and the notifications written
 * down meanwhile go with it, and where the phone is now (once the location is allowed). Without a connection nothing is lost: the read position moves on
 * only after the server took the spans, and the notifications wait in SensorsStore.
 */
public class SensorsWorker extends Worker {

    private static final String PERIODIC = "phone-sensors";
    private static final String NOW = "phone-sensors-now";
    /** The first run reads this far back. */
    private static final long FIRST_READ_MS = TimeUnit.DAYS.toMillis(1);
    /** The server takes at most this many in one request. */
    private static final int BATCH = 500;

    public SensorsWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Started when the collection is switched on, and kept by Android after a restart. */
    public static void schedule(Context context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC,
            ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(SensorsWorker.class, 15, TimeUnit.MINUTES).build()
        );
    }

    public static void runNow(Context context) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            NOW,
            ExistingWorkPolicy.REPLACE,
            new OneTimeWorkRequest.Builder(SensorsWorker.class).build()
        );
    }

    public static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC);
        LocationUpdatesReceiver.unsubscribe(context);
        PlacesService.stop(context);
    }

    @NonNull
    @Override
    public Result doWork() {
        SensorsStore store = new SensorsStore(getApplicationContext());
        if (!store.configured()) {
            return Result.success();
        }
        try {
            // Taken first: a fix needs no network, and waits in the store for one.
            takeLocation(store);
            sendUsage(store);
            sendNotifications(store);
            sendLocations(store);
            return Result.success();
        } catch (IOException | JSONException e) {
            return Result.retry();
        }
    }

    private void sendUsage(SensorsStore store) throws IOException, JSONException {
        Context context = getApplicationContext();
        UsageStatsManager usage = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usage == null || !PhoneSensorsPlugin.hasUsageAccess(context)) {
            return;
        }
        long until = System.currentTimeMillis();
        long from = store.cursor() > 0 ? store.cursor() : until - FIRST_READ_MS;
        List<UsageSpans.Event> events = new ArrayList<>();
        UsageEvents read = usage.queryEvents(from, until);
        UsageEvents.Event event = new UsageEvents.Event();
        while (read.hasNextEvent()) {
            read.getNextEvent(event);
            events.add(new UsageSpans.Event(event.getPackageName(), event.getEventType(), event.getTimeStamp()));
        }
        Set<String> ignored = AppLabels.homeScreens(context);
        UsageSpans.Result result = UsageSpans.build(events, store.open(), until, ignored);
        for (int i = 0; i < result.spans.size(); i += BATCH) {
            JSONArray spans = new JSONArray();
            for (UsageSpans.Span span : result.spans.subList(i, Math.min(i + BATCH, result.spans.size()))) {
                spans.put(new JSONObject()
                    .put("app", span.app)
                    .put("appName", AppLabels.of(context, span.app))
                    .put("title", "")
                    .put("startedAt", iso(span.start))
                    .put("endedAt", iso(span.end)));
            }
            post(store, "/api/activity/device/spans", new JSONObject().put("spans", spans));
        }
        // How often the phone is picked up: each unlock, sent with the time in apps.
        List<Long> unlocks = UsageSpans.unlocks(events, until);
        for (int i = 0; i < unlocks.size(); i += BATCH) {
            JSONArray moments = new JSONArray();
            for (long at : unlocks.subList(i, Math.min(i + BATCH, unlocks.size()))) {
                moments.put(iso(at));
            }
            post(store, "/api/activity/device/unlocks", new JSONObject().put("unlocks", moments));
        }
        store.advance(until, result.open);
    }

    private void sendNotifications(SensorsStore store) throws IOException, JSONException {
        JSONArray queue = store.notifications();
        while (queue.length() > 0) {
            int count = Math.min(BATCH, queue.length());
            JSONArray batch = new JSONArray();
            for (int i = 0; i < count; i++) {
                JSONObject item = queue.getJSONObject(i);
                batch.put(new JSONObject()
                    .put("app", item.getString("app"))
                    .put("appName", item.optString("appName", item.getString("app")))
                    .put("title", item.optString("title", ""))
                    .put("text", item.optString("text", ""))
                    .put("postedAt", iso(item.getLong("postedAt"))));
            }
            post(store, "/api/activity/device/notifications", new JSONObject().put("notifications", batch));
            store.dropNotifications(count);
            queue = store.notifications();
        }
    }

    private void takeLocation(SensorsStore store) throws JSONException {
        // Every minute while the service runs (started again here after a reboot)…
        PlacesService.start(getApplicationContext());
        // …the updates Android delivers by itself if it does not (an app update drops them)…
        LocationUpdatesReceiver.subscribe(getApplicationContext());
        // …and a fix of its own, which works while the app is on the screen.
        Location fix = PhoneLocation.take(getApplicationContext());
        if (fix == null) {
            return;
        }
        store.queueLocation(PhoneLocation.toJson(fix));
    }

    private void sendLocations(SensorsStore store) throws IOException, JSONException {
        JSONArray queue = store.locations();
        while (queue.length() > 0) {
            int count = Math.min(BATCH, queue.length());
            JSONArray batch = new JSONArray();
            for (int i = 0; i < count; i++) {
                JSONObject item = queue.getJSONObject(i);
                batch.put(new JSONObject()
                    .put("at", iso(item.getLong("at")))
                    .put("latitude", item.getDouble("latitude"))
                    .put("longitude", item.getDouble("longitude"))
                    .put("accuracy", item.getDouble("accuracy")));
            }
            post(store, "/api/activity/device/locations", new JSONObject().put("locations", batch));
            store.dropLocations(count);
            queue = store.locations();
        }
    }

    /** Throws on no answer or an error of the server, so the run is tried again. */
    private static void post(SensorsStore store, String path, JSONObject body) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(store.server() + path).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(30_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Device " + store.token());
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            if (status == 401) {
                // The device was removed in the dashboard: the collection stops.
                store.clear();
                return;
            }
            if (status >= 300) {
                throw new IOException("HTTP " + status);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String iso(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }
}
