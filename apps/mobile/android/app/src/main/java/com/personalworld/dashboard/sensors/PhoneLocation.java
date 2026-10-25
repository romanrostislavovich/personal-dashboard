package com.personalworld.dashboard.sensors;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.HandlerThread;
import androidx.core.content.ContextCompat;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Where the phone is, at a small cost to the battery: a fix another app asked for lately is
 * taken as it is; else one fix from Wi-Fi and cell towers (no GPS); only a phone with that
 * switched off is asked by GPS, and not for long.
 */
final class PhoneLocation {

    /** A fix this fresh is as good as a new one. */
    private static final long FRESH_MS = TimeUnit.MINUTES.toMillis(5);
    /** Without a new fix, an older one still tells where the phone was since the last run. */
    private static final long USABLE_MS = TimeUnit.MINUTES.toMillis(15);
    private static final long NETWORK_WAIT_S = 30;
    private static final long GPS_WAIT_S = 20;

    private PhoneLocation() {}

    /** Whether Android lets the app know the location in the background too. */
    static boolean allowed(Context context) {
        boolean foreground = foregroundAllowed(context);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return foreground;
        }
        return foreground && granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION);
    }

    static boolean foregroundAllowed(Context context) {
        return granted(context, Manifest.permission.ACCESS_FINE_LOCATION)
            || granted(context, Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private static boolean granted(Context context, String permission) {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** `null` — not allowed, or the phone could not tell. */
    @SuppressWarnings("MissingPermission")
    static Location take(Context context) {
        if (!allowed(context)) {
            return null;
        }
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            return null;
        }
        Location last = lastKnown(manager);
        long now = System.currentTimeMillis();
        if (last != null && now - last.getTime() <= FRESH_MS) {
            return last;
        }
        Location fix = null;
        if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            fix = single(manager, LocationManager.NETWORK_PROVIDER, NETWORK_WAIT_S);
        } else if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            fix = single(manager, LocationManager.GPS_PROVIDER, GPS_WAIT_S);
        }
        if (fix != null) {
            return fix;
        }
        return last != null && now - last.getTime() <= USABLE_MS ? last : null;
    }

    @SuppressWarnings("MissingPermission")
    private static Location lastKnown(LocationManager manager) {
        Location best = null;
        for (String provider : manager.getProviders(true)) {
            Location location = manager.getLastKnownLocation(provider);
            if (location != null && (best == null || location.getTime() > best.getTime())) {
                best = location;
            }
        }
        return best;
    }

    /** One fix of the provider, waited for at most `seconds`; the request ends either way. */
    @SuppressWarnings({"MissingPermission", "deprecation"})
    private static Location single(LocationManager manager, String provider, long seconds) {
        HandlerThread thread = new HandlerThread("phone-location");
        thread.start();
        AtomicReference<Location> result = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        LocationListener listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                result.set(location);
                done.countDown();
            }

            @Override
            public void onStatusChanged(String p, int status, Bundle extras) {}

            @Override
            public void onProviderEnabled(String p) {}

            @Override
            public void onProviderDisabled(String p) {
                done.countDown();
            }
        };
        try {
            manager.requestSingleUpdate(provider, listener, thread.getLooper());
            done.await(seconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            // The provider went away meanwhile: no fix this time.
        } finally {
            manager.removeUpdates(listener);
            thread.quitSafely();
        }
        return result.get();
    }
}
