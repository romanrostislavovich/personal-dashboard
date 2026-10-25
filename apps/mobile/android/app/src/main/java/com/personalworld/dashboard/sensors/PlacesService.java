package com.personalworld.dashboard.sensors;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
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
import java.util.concurrent.TimeUnit;
import org.json.JSONException;

/**
 * Where the phone is, every minute: Android lets an app in the background know the location
 * only a few times an hour, so the places of a day (and the trips between them) need a service
 * the user sees — the quiet notification "records the places", like a fitness app's. Wi-Fi and
 * cell towers only, no GPS. The fixes wait in SensorsStore for SensorsWorker to send.
 */
public class PlacesService extends Service {

    private static final String TAG = "PhoneLocation";
    private static final String CHANNEL = "places";
    private static final int NOTIFICATION_ID = 4208;
    private static final long EVERY_MS = TimeUnit.MINUTES.toMillis(1);

    private LocationListener listener;

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
        try {
            store.queueLocation(PhoneLocation.toJson(location));
        } catch (JSONException e) {
            Log.w(TAG, "A fix was not kept", e);
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
            .setContentTitle(getString(R.string.places_title))
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
        listener = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
