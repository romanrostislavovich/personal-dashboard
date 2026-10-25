package com.personalworld.dashboard.sensors;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.util.Log;
import java.util.concurrent.TimeUnit;
import org.json.JSONException;

/**
 * The location delivered by Android itself, about every 15 minutes, to an app in the background:
 * a request made from a background job is not answered on MIUI (the phone told nothing after
 * the app left the screen), but updates to a PendingIntent are — the way Android means a
 * background app to follow the location. Wi-Fi and cell towers only; the fixes wait in
 * SensorsStore for SensorsWorker to send.
 */
public class LocationUpdatesReceiver extends BroadcastReceiver {

    private static final String TAG = "PhoneLocation";
    private static final String ACTION = "com.personalworld.dashboard.LOCATION_UPDATE";
    private static final long EVERY_MS = TimeUnit.MINUTES.toMillis(15);

    @Override
    public void onReceive(Context context, Intent intent) {
        Location location = intent.getParcelableExtra(LocationManager.KEY_LOCATION_CHANGED);
        if (location == null) {
            return;
        }
        SensorsStore store = new SensorsStore(context);
        if (!store.configured()) {
            return;
        }
        try {
            store.queueLocation(PhoneLocation.toJson(location));
        } catch (JSONException e) {
            Log.w(TAG, "A fix was not kept", e);
        }
    }

    /** Asks Android for the updates; asking again replaces the request, so it is safe each run. */
    @SuppressWarnings("MissingPermission")
    static void subscribe(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null || !PhoneLocation.allowed(context)) {
            return;
        }
        String provider = manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            ? LocationManager.NETWORK_PROVIDER
            : LocationManager.PASSIVE_PROVIDER;
        try {
            manager.requestLocationUpdates(provider, EVERY_MS, 0, pending(context));
        } catch (RuntimeException e) {
            Log.w(TAG, "Location updates were not requested", e);
        }
    }

    static void unsubscribe(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager != null) {
            manager.removeUpdates(pending(context));
        }
    }

    private static PendingIntent pending(Context context) {
        Intent intent = new Intent(context, LocationUpdatesReceiver.class).setAction(ACTION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // The system writes the location into the intent: it must stay mutable.
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }
}
