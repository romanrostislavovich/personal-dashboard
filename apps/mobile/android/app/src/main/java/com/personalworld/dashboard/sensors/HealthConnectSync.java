package com.personalworld.dashboard.sensors;

import android.content.Context;
import android.content.pm.PackageManager;
import android.health.connect.AggregateRecordsGroupedByDurationResponse;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.changelog.ChangeLogTokenRequest;
import android.health.connect.changelog.ChangeLogTokenResponse;
import android.health.connect.changelog.ChangeLogsRequest;
import android.health.connect.changelog.ChangeLogsResponse;
import android.health.connect.datatypes.AggregationType;
import android.health.connect.datatypes.DistanceRecord;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.FloorsClimbedRecord;
import android.health.connect.datatypes.HeartRateRecord;
import android.health.connect.datatypes.HeartRateVariabilityRmssdRecord;
import android.health.connect.datatypes.InstantRecord;
import android.health.connect.datatypes.IntervalRecord;
import android.health.connect.datatypes.MindfulnessSessionRecord;
import android.health.connect.datatypes.OxygenSaturationRecord;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.RespiratoryRateRecord;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.SkinTemperatureRecord;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.TotalCaloriesBurnedRecord;
import android.os.Build;
import android.os.OutcomeReceiver;
import android.util.Log;
import androidx.annotation.RequiresApi;
import androidx.core.content.ContextCompat;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The band through Health Connect (docs/telemetry.md, "The band"): what the band's app (Google
 * Health for the Fitbit Air) writes there goes to Health → Band. Android 14 and later, where Health
 * Connect is part of the system and its API is Java's.
 *
 * The first run sends the history; later runs ask Health Connect what changed since (its change
 * log: the band syncs late, a record can land hours in the past) and send those hours again —
 * whole, since the server replaces the window it is sent (POST /api/medical/band/device).
 */
public final class HealthConnectSync {

    private static final String TAG = "HealthConnectSync";
    /** The first run reads this far back (further needs READ_HEALTH_DATA_HISTORY, asked too). */
    private static final long HISTORY_DAYS = 60;
    /** One upload: at most a day (the server takes two). */
    private static final long CHUNK_MS = TimeUnit.HOURS.toMillis(24);
    /** The pulse per minute is asked in pieces this long (Health Connect limits the groups). */
    private static final long MINUTES_PIECE_MS = TimeUnit.HOURS.toMillis(6);
    /** A deletion tells no time: the days this far back are sent again. */
    private static final long AFTER_DELETION_MS = TimeUnit.DAYS.toMillis(3);
    private static final long HOUR_MS = TimeUnit.HOURS.toMillis(1);
    private static final long WAIT_SECONDS = 60;

    /** Every kind read; Android asks about them on one screen of Health Connect. */
    public static final String[] PERMISSIONS = permissions();
    /** Without these nothing useful comes: the card says "not allowed". */
    public static final String[] REQUIRED = {
        "android.permission.health.READ_HEART_RATE",
        "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND",
    };

    private HealthConnectSync() {}

    private static String[] permissions() {
        List<String> list = new ArrayList<>();
        for (String kind : new String[] {
            "HEART_RATE", "HEART_RATE_VARIABILITY", "RESTING_HEART_RATE", "SLEEP", "STEPS",
            "TOTAL_CALORIES_BURNED", "DISTANCE", "FLOORS_CLIMBED", "EXERCISE", "OXYGEN_SATURATION",
            "RESPIRATORY_RATE", "HEALTH_DATA_IN_BACKGROUND", "HEALTH_DATA_HISTORY",
        }) {
            list.add("android.permission.health.READ_" + kind);
        }
        if (Build.VERSION.SDK_INT >= 35) {
            list.add("android.permission.health.READ_SKIN_TEMPERATURE");
        }
        if (Build.VERSION.SDK_INT >= 36) {
            list.add("android.permission.health.READ_MINDFULNESS");
        }
        return list.toArray(new String[0]);
    }

    public static boolean supported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE;
    }

    public static boolean allowed(Context context) {
        if (!supported()) {
            return false;
        }
        for (String permission : REQUIRED) {
            if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private static boolean granted(Context context, String kind) {
        return ContextCompat.checkSelfPermission(context, "android.permission.health.READ_" + kind)
            == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * One run of the collection. Throws IOException when the server could not take it: the change
     * log's position then stays, and the next run sends the same hours.
     */
    public static void run(Context context, SensorsStore store) throws IOException, JSONException {
        if (!allowed(context)) {
            return;
        }
        try {
            new Reader(context).sync(store);
        } catch (IOException | JSONException e) {
            throw e;
        } catch (Exception e) {
            // Health Connect itself failed (updating, a permission taken back): next run.
            Log.w(TAG, "Health Connect was not read", e);
        }
    }

    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private static final class Reader {
        /** Sent as the minutes and hours (Health Connect's sums): not read record by record. */
        private static final List<Class<? extends Record>> AGGREGATED = List.of(
            HeartRateRecord.class, StepsRecord.class, TotalCaloriesBurnedRecord.class,
            DistanceRecord.class, FloorsClimbedRecord.class);

        private final Context context;
        private final HealthConnectManager manager;
        private final Executor direct = Runnable::run;

        Reader(Context context) {
            this.context = context;
            this.manager = context.getSystemService(HealthConnectManager.class);
        }

        private List<Class<? extends Record>> types() {
            List<Class<? extends Record>> types = new ArrayList<>();
            types.add(HeartRateRecord.class);
            types.add(StepsRecord.class);
            if (granted(context, "HEART_RATE_VARIABILITY")) types.add(HeartRateVariabilityRmssdRecord.class);
            if (granted(context, "RESTING_HEART_RATE")) types.add(RestingHeartRateRecord.class);
            if (granted(context, "SLEEP")) types.add(SleepSessionRecord.class);
            if (granted(context, "TOTAL_CALORIES_BURNED")) types.add(TotalCaloriesBurnedRecord.class);
            if (granted(context, "DISTANCE")) types.add(DistanceRecord.class);
            if (granted(context, "FLOORS_CLIMBED")) types.add(FloorsClimbedRecord.class);
            if (granted(context, "EXERCISE")) types.add(ExerciseSessionRecord.class);
            if (granted(context, "OXYGEN_SATURATION")) types.add(OxygenSaturationRecord.class);
            if (granted(context, "RESPIRATORY_RATE")) types.add(RespiratoryRateRecord.class);
            if (Build.VERSION.SDK_INT >= 35 && granted(context, "SKIN_TEMPERATURE")) {
                types.add(SkinTemperatureRecord.class);
            }
            if (Build.VERSION.SDK_INT >= 36 && granted(context, "MINDFULNESS")) {
                types.add(MindfulnessSessionRecord.class);
            }
            return types;
        }

        void sync(SensorsStore store) throws Exception {
            long now = System.currentTimeMillis();
            List<Class<? extends Record>> types = types();
            // The kinds allowed changed: the old position knows nothing of the new ones.
            StringBuilder names = new StringBuilder();
            for (Class<? extends Record> type : types) {
                names.append(type.getSimpleName()).append(',');
            }
            String kinds = names.toString();
            String token = store.text("healthToken");
            if (token.isEmpty() || !kinds.equals(store.text("healthKinds"))) {
                String fresh = changesToken(types);
                send(store, now - TimeUnit.DAYS.toMillis(HISTORY_DAYS), now);
                store.setText("healthToken", fresh);
                store.setText("healthKinds", kinds);
                return;
            }
            long from = Long.MAX_VALUE;
            long to = Long.MIN_VALUE;
            String next = token;
            try {
                ChangeLogsResponse changes;
                do {
                    String page = next;
                    changes = await(receiver -> manager.getChangeLogs(
                        new ChangeLogsRequest.Builder(page).setPageSize(1000).build(), direct, receiver));
                    for (Record record : changes.getUpsertedRecords()) {
                        long[] span = span(record);
                        from = Math.min(from, span[0]);
                        to = Math.max(to, span[1]);
                    }
                    if (!changes.getDeletedLogs().isEmpty()) {
                        from = Math.min(from, now - AFTER_DELETION_MS);
                        to = Math.max(to, now);
                    }
                    next = changes.getNextChangesToken();
                } while (changes.hasMorePages());
            } catch (HealthConnectException e) {
                // The position is too old (30 days unused) or unknown: start again from a few days.
                Log.w(TAG, "The change log was refused; sending the last days again", e);
                next = changesToken(types);
                from = now - AFTER_DELETION_MS;
                to = now;
            }
            if (from <= to) {
                send(store, from, Math.min(to + 1, now));
            }
            store.setText("healthToken", next);
        }

        private String changesToken(List<Class<? extends Record>> types) throws Exception {
            ChangeLogTokenRequest.Builder request = new ChangeLogTokenRequest.Builder();
            for (Class<? extends Record> type : types) {
                request.addRecordType(type);
            }
            ChangeLogTokenResponse response = await(receiver ->
                manager.getChangeLogToken(request.build(), direct, receiver));
            return response.getToken();
        }

        /** The hours from `from` to `to`, whole hours, a day in each upload. */
        private void send(SensorsStore store, long from, long to) throws Exception {
            long start = Math.floorDiv(from, HOUR_MS) * HOUR_MS;
            long end = Math.floorDiv(to + HOUR_MS - 1, HOUR_MS) * HOUR_MS;
            for (long chunk = start; chunk < end; chunk += CHUNK_MS) {
                long chunkEnd = Math.min(chunk + CHUNK_MS, end);
                SensorsWorker.post(store, "/api/medical/band/device", window(chunk, chunkEnd));
            }
        }

        private JSONObject window(long from, long to) throws Exception {
            List<Class<? extends Record>> types = types();
            JSONArray minutes = new JSONArray();
            for (long piece = from; piece < to; piece += MINUTES_PIECE_MS) {
                minutes(piece, Math.min(piece + MINUTES_PIECE_MS, to), minutes);
            }
            JSONArray points = new JSONArray();
            JSONArray sessions = new JSONArray();
            for (Class<? extends Record> type : types) {
                if (AGGREGATED.contains(type)) {
                    continue;
                }
                for (Record record : read(type, from, to)) {
                    record(record, from, to, points, sessions);
                }
            }
            return new JSONObject()
                .put("from", SensorsWorker.iso(from))
                .put("to", SensorsWorker.iso(to))
                .put("minutes", minutes)
                .put("hours", hours(from, to, types))
                .put("points", points)
                .put("sessions", sessions);
        }

        /** The pulse (average, lowest, highest) and the steps of each minute the band told. */
        private void minutes(long from, long to, JSONArray out) throws Exception {
            AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(range(from, to))
                .addAggregationType(HeartRateRecord.BPM_AVG)
                .addAggregationType(HeartRateRecord.BPM_MIN)
                .addAggregationType(HeartRateRecord.BPM_MAX)
                .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL)
                .build();
            List<AggregateRecordsGroupedByDurationResponse<Long>> groups = await(receiver ->
                manager.aggregateGroupByDuration(request, Duration.ofMinutes(1), direct, receiver));
            for (AggregateRecordsGroupedByDurationResponse<Long> group : groups) {
                Long bpm = group.get(HeartRateRecord.BPM_AVG);
                Long steps = group.get(StepsRecord.STEPS_COUNT_TOTAL);
                if (bpm == null && (steps == null || steps == 0)) {
                    continue;
                }
                out.put(new JSONObject()
                    .put("at", SensorsWorker.iso(group.getStartTime().toEpochMilli()))
                    .put("bpm", orNull(bpm))
                    .put("bpmMin", orNull(group.get(HeartRateRecord.BPM_MIN)))
                    .put("bpmMax", orNull(group.get(HeartRateRecord.BPM_MAX)))
                    .put("steps", orNull(steps)));
            }
        }

        /** Each hour's steps, calories, distance and floors (Health Connect's sums). */
        private JSONArray hours(long from, long to, List<Class<? extends Record>> types) throws Exception {
            List<AggregateRecordsGroupedByDurationResponse<Long>> steps =
                hourly(StepsRecord.STEPS_COUNT_TOTAL, from, to);
            List<AggregateRecordsGroupedByDurationResponse<android.health.connect.datatypes.units.Energy>> calories =
                types.contains(TotalCaloriesBurnedRecord.class)
                    ? hourly(TotalCaloriesBurnedRecord.ENERGY_TOTAL, from, to) : new ArrayList<>();
            List<AggregateRecordsGroupedByDurationResponse<android.health.connect.datatypes.units.Length>> distance =
                types.contains(DistanceRecord.class)
                    ? hourly(DistanceRecord.DISTANCE_TOTAL, from, to) : new ArrayList<>();
            List<AggregateRecordsGroupedByDurationResponse<Double>> floors =
                types.contains(FloorsClimbedRecord.class)
                    ? hourly(FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL, from, to) : new ArrayList<>();
            JSONArray out = new JSONArray();
            for (long hour = from; hour < to; hour += HOUR_MS) {
                Long step = at(steps, hour, StepsRecord.STEPS_COUNT_TOTAL);
                android.health.connect.datatypes.units.Energy energy =
                    at(calories, hour, TotalCaloriesBurnedRecord.ENERGY_TOTAL);
                android.health.connect.datatypes.units.Length length =
                    at(distance, hour, DistanceRecord.DISTANCE_TOTAL);
                Double floor = at(floors, hour, FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL);
                if (step == null && length == null && floor == null) {
                    // Calories alone are the body's own estimate, told for every hour: not the band.
                    continue;
                }
                out.put(new JSONObject()
                    .put("at", SensorsWorker.iso(hour))
                    .put("steps", orNull(step))
                    .put("calories", energy == null ? JSONObject.NULL : energy.getInCalories() / 1000)
                    .put("distanceM", length == null ? JSONObject.NULL : length.getInMeters())
                    .put("floors", orNull(floor)));
            }
            return out;
        }

        private <T> List<AggregateRecordsGroupedByDurationResponse<T>> hourly(
            AggregationType<T> type, long from, long to) throws Exception {
            AggregateRecordsRequest<T> request = new AggregateRecordsRequest.Builder<T>(range(from, to))
                .addAggregationType(type)
                .build();
            return await(receiver ->
                manager.aggregateGroupByDuration(request, Duration.ofHours(1), direct, receiver));
        }

        private <T> T at(List<AggregateRecordsGroupedByDurationResponse<T>> groups, long hour, AggregationType<T> type) {
            for (AggregateRecordsGroupedByDurationResponse<T> group : groups) {
                if (group.getStartTime().toEpochMilli() == hour) {
                    return group.get(type);
                }
            }
            return null;
        }

        /** Every record of a kind in the window, page by page. */
        private <T extends Record> List<T> read(Class<T> type, long from, long to) throws Exception {
            List<T> records = new ArrayList<>();
            long pageToken = -1;
            do {
                ReadRecordsRequestUsingFilters.Builder<T> builder =
                    new ReadRecordsRequestUsingFilters.Builder<>(type)
                        .setTimeRangeFilter(range(from, to))
                        .setPageSize(5000);
                if (pageToken != -1) {
                    builder.setPageToken(pageToken);
                }
                ReadRecordsRequestUsingFilters<T> request = builder.build();
                ReadRecordsResponse<T> response = await(receiver -> manager.readRecords(request, direct, receiver));
                records.addAll(response.getRecords());
                pageToken = response.getNextPageToken();
            } while (pageToken != -1);
            return records;
        }

        /** A record as a point or a session; the rest are in the minutes and hours already. */
        private void record(Record record, long from, long to, JSONArray points, JSONArray sessions)
            throws JSONException {
            if (record instanceof HeartRateVariabilityRmssdRecord hrv) {
                point(points, "hrv", hrv.getTime(), hrv.getHeartRateVariabilityMillis(), from, to);
            } else if (record instanceof RestingHeartRateRecord resting) {
                point(points, "restingHr", resting.getTime(), resting.getBeatsPerMinute(), from, to);
            } else if (record instanceof OxygenSaturationRecord spo2) {
                point(points, "spo2", spo2.getTime(), spo2.getPercentage().getValue(), from, to);
            } else if (record instanceof RespiratoryRateRecord breath) {
                point(points, "respiratoryRate", breath.getTime(), breath.getRate(), from, to);
            } else if (Build.VERSION.SDK_INT >= 35 && record instanceof SkinTemperatureRecord skin) {
                skin(points, skin, from, to);
            } else if (record instanceof SleepSessionRecord sleep) {
                if (starts(sleep, from, to)) {
                    JSONArray stages = new JSONArray();
                    for (SleepSessionRecord.Stage stage : sleep.getStages()) {
                        stages.put(new JSONObject()
                            .put("startAt", SensorsWorker.iso(stage.getStartTime().toEpochMilli()))
                            .put("endAt", SensorsWorker.iso(stage.getEndTime().toEpochMilli()))
                            .put("stage", stage(stage.getType())));
                    }
                    sessions.put(session("sleep", sleep, JSONObject.NULL, sleep.getTitle(), stages));
                }
            } else if (record instanceof ExerciseSessionRecord exercise) {
                if (starts(exercise, from, to)) {
                    sessions.put(session("exercise", exercise, exercise.getExerciseType(), exercise.getTitle(), new JSONArray()));
                }
            } else if (Build.VERSION.SDK_INT >= 36 && record instanceof MindfulnessSessionRecord mindful) {
                if (starts(mindful, from, to)) {
                    sessions.put(session("mindfulness", mindful, mindful.getMindfulnessSessionType(), mindful.getTitle(), new JSONArray()));
                }
            }
        }

        /** The night's skin temperature: its average against the band's own baseline. */
        @RequiresApi(35)
        private void skin(JSONArray points, SkinTemperatureRecord skin, long from, long to) throws JSONException {
            List<SkinTemperatureRecord.Delta> deltas = skin.getDeltas();
            if (deltas.isEmpty()) {
                return;
            }
            double sum = 0;
            for (SkinTemperatureRecord.Delta delta : deltas) {
                sum += delta.getDelta().getInCelsius();
            }
            point(points, "skinTemp", skin.getStartTime(), sum / deltas.size(), from, to);
        }

        private void point(JSONArray points, String kind, Instant at, double value, long from, long to)
            throws JSONException {
            long millis = at.toEpochMilli();
            if (millis >= from && millis < to) {
                points.put(new JSONObject().put("kind", kind).put("at", SensorsWorker.iso(millis)).put("value", value));
            }
        }

        private boolean starts(IntervalRecord record, long from, long to) {
            long start = record.getStartTime().toEpochMilli();
            return start >= from && start < to;
        }

        private JSONObject session(String kind, IntervalRecord record, Object type, CharSequence title, JSONArray stages)
            throws JSONException {
            return new JSONObject()
                .put("kind", kind)
                .put("startAt", SensorsWorker.iso(record.getStartTime().toEpochMilli()))
                .put("endAt", SensorsWorker.iso(record.getEndTime().toEpochMilli()))
                .put("type", type)
                .put("title", title == null || title.length() == 0 ? JSONObject.NULL : title.toString())
                .put("stages", stages);
        }

        private String stage(int type) {
            switch (type) {
                case SleepSessionRecord.StageType.STAGE_TYPE_AWAKE:
                case SleepSessionRecord.StageType.STAGE_TYPE_AWAKE_IN_BED:
                    return "awake";
                case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_LIGHT:
                    return "light";
                case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_DEEP:
                    return "deep";
                case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_REM:
                    return "rem";
                case SleepSessionRecord.StageType.STAGE_TYPE_AWAKE_OUT_OF_BED:
                    return "out";
                default:
                    return "asleep";
            }
        }

        private long[] span(Record record) {
            if (record instanceof IntervalRecord interval) {
                return new long[] {interval.getStartTime().toEpochMilli(), interval.getEndTime().toEpochMilli()};
            }
            long at = ((InstantRecord) record).getTime().toEpochMilli();
            return new long[] {at, at};
        }

        private TimeInstantRangeFilter range(long from, long to) {
            return new TimeInstantRangeFilter.Builder()
                .setStartTime(Instant.ofEpochMilli(from))
                .setEndTime(Instant.ofEpochMilli(to))
                .build();
        }

        private Object orNull(Object value) {
            return value == null ? JSONObject.NULL : value;
        }

        /** Health Connect answers through a callback: the worker's thread waits for it. */
        private <R> R await(Consumer<OutcomeReceiver<R, HealthConnectException>> call) throws Exception {
            CompletableFuture<R> result = new CompletableFuture<>();
            call.accept(new OutcomeReceiver<R, HealthConnectException>() {
                @Override
                public void onResult(R value) {
                    result.complete(value);
                }

                @Override
                public void onError(HealthConnectException error) {
                    result.completeExceptionally(error);
                }
            });
            try {
                return result.get(WAIT_SECONDS, TimeUnit.SECONDS);
            } catch (java.util.concurrent.ExecutionException e) {
                throw e.getCause() instanceof Exception cause ? cause : e;
            }
        }
    }
}
