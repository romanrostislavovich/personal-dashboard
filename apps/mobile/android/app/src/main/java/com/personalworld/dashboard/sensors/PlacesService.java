package com.personalworld.dashboard.sensors;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.hardware.TriggerEvent;
import android.hardware.TriggerEventListener;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.personalworld.dashboard.MainActivity;
import com.personalworld.dashboard.R;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONException;

/**
 * Where the phone is: Android lets an app in the background know the location only a few times
 * an hour, so the places of a day and the routes between them need a service the user sees —
 * the quiet notification "records the places", like a fitness app's. Still: Wi-Fi and cell
 * towers every minute. On the move (MotionMode): GPS every 5 seconds too, so a route follows the
 * streets; it stops when the phone stays. The fixes wait in SensorsStore for SensorsWorker.
 */
public class PlacesService extends Service {

    private static final String TAG = "PhoneLocation";
    private static final String CHANNEL = "places";
    private static final int NOTIFICATION_ID = 4208;
    private static final long EVERY_MS = TimeUnit.MINUTES.toMillis(1);
    private static final long MOVING_MS = TimeUnit.SECONDS.toMillis(5);
    private static final float MOVING_MIN_M = 5;

    /** The fixes go to the server this often: a background job waits for hours in deep sleep. */
    private static final long SEND_EVERY_MIN = 5;

    private final MotionMode mode = new MotionMode();
    private ScheduledExecutorService sender;
    private SensorManager sensors;
    private TriggerEventListener motion;
    private LocationListener listener;
    /** Only while moving. */
    private LocationListener gps;

    /** Started when the collection is on and the location allowed; safe to call again. */
    public static void start(Context context) {
        if (!new SensorsStore(context).configured() || !PhoneLocation.allowed(context)) {
            return;
        }
        try {
            ContextCompat.startForegroundService(context, new Intent(context, PlacesService.class));
        } catch (RuntimeException e) {
            // Android 12 and later do not start it from the background: the app's next start does.
            Log.w(TAG, "The places service did not start", e);
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, PlacesService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = notification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        if (!new SensorsStore(this).configured() || !PhoneLocation.allowed(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        subscribe();
        armMotion();
        startSending();
        // Killed for memory: Android starts it again.
        return START_STICKY;
    }

    @SuppressWarnings("MissingPermission")
    private void subscribe() {
        if (listener != null) {
            return;
        }
        LocationManager manager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            return;
        }
        String provider = manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            ? LocationManager.NETWORK_PROVIDER
            : LocationManager.PASSIVE_PROVIDER;
        listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                keep(location);
            }

            @Override
            public void onStatusChanged(String p, int status, Bundle extras) {}

            @Override
            public void onProviderEnabled(String p) {}

            @Override
            public void onProviderDisabled(String p) {}
        };
        try {
            manager.requestLocationUpdates(provider, EVERY_MS, 0, listener, Looper.getMainLooper());
        } catch (RuntimeException e) {
            Log.w(TAG, "Location updates were not requested", e);
            listener = null;
        }
    }

    private void keep(Location location) {
        SensorsStore store = new SensorsStore(this);
        if (!store.configured()) {
            stopSelf();
            return;
        }
        float accuracy = location.hasAccuracy() ? location.getAccuracy() : 1000;
        if (mode.onFix(location.getLatitude(), location.getLongitude(), accuracy, location.getTime())) {
            follow(mode.moving());
        }
        try {
            store.queueLocation(PhoneLocation.toJson(location));
        } catch (JSONException e) {
            Log.w(TAG, "A fix was not kept", e);
        }
    }

    /**
     * The motion sensor (a hardware one: it costs nothing while it waits) wakes the service when
     * the phone starts moving; with the screen off the network fixes come too rarely to tell it.
     * It fires once, so it is armed again each time the phone is still.
     */
    private void armMotion() {
        if (sensors == null) {
            sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        }
        Sensor sensor = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION);
        if (sensor == null) {
            return;
        }
        if (motion == null) {
            motion = new TriggerEventListener() {
                @Override
                public void onTrigger(TriggerEvent event) {
                    if (mode.startMoving(System.currentTimeMillis())) {
                        follow(true);
                    }
                }
            };
        }
        sensors.requestTriggerSensor(motion, sensor);
    }

    private void startSending() {
        if (sender != null) {
            return;
        }
        sender = Executors.newSingleThreadScheduledExecutor();
        sender.scheduleWithFixedDelay(() -> {
            SensorsStore store = new SensorsStore(this);
            if (!store.configured()) {
                return;
            }
            try {
                SensorsWorker.sendLocations(store);
            } catch (Exception e) {
                // No network now: they wait in the store for the next time.
                Log.w(TAG, "Fixes were not sent", e);
            }
        }, SEND_EVERY_MIN, SEND_EVERY_MIN, TimeUnit.MINUTES);
    }

    /** On the move: GPS every few seconds as well; still: the network fixes alone. */
    @SuppressWarnings("MissingPermission")
    private void follow(boolean moving) {
        LocationManager manager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            return;
        }
        if (moving && gps == null && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            gps = new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    keep(location);
                }

                @Override
                public void onStatusChanged(String p, int status, Bundle extras) {}

                @Override
                public void onProviderEnabled(String p) {}

                @Override
                public void onProviderDisabled(String p) {}
            };
            try {
                manager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER, MOVING_MS, MOVING_MIN_M, gps, Looper.getMainLooper()
                );
            } catch (RuntimeException e) {
                Log.w(TAG, "GPS was not requested", e);
                gps = null;
            }
        } else if (!moving && gps != null) {
            manager.removeUpdates(gps);
            gps = null;
        }
        if (!moving) {
            armMotion();
        }
        NotificationManager notifications = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notifications != null) {
            notifications.notify(NOTIFICATION_ID, notification());
        }
    }

    private Notification notification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            // Low: no sound, no pop-up, only a line in the shade.
            NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                getString(R.string.places_channel),
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), flags);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(getString(mode.moving() ? R.string.places_moving : R.string.places_title))
            .setContentText(getString(R.string.places_text))
            .setContentIntent(open)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    @SuppressWarnings("MissingPermission")
    @Override
    public void onDestroy() {
        LocationManager manager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (manager != null && listener != null) {
            manager.removeUpdates(listener);
        }
        if (manager != null && gps != null) {
            manager.removeUpdates(gps);
        }
        listener = null;
        gps = null;
        if (sensors != null && motion != null) {
            sensors.cancelTriggerSensor(motion, null);
        }
        if (sender != null) {
            sender.shutdownNow();
            sender = null;
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
