package com.personalworld.dashboard.sensors;

import android.Manifest;
import android.app.Activity;
import android.app.AppOpsManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.Process;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;

/**
 * The phone as a sensor, switched on and looked after from the page (`phone-sensors.ts` in
 * web-core): where to send and with which device token, what Android has allowed (the usage of
 * apps, the notifications, the location, running in the background), and the settings screens to
 * allow them.
 */
@CapacitorPlugin(name = "PhoneSensors")
public class PhoneSensorsPlugin extends Plugin {

    private static final int LOCATION_REQUEST = 4207;
    private static final int EXTRA_REQUEST = 4209;

    /** The optional signals and the permissions each needs (docs/telemetry.md). */
    private static final Map<String, String[]> EXTRAS = new LinkedHashMap<>();

    static {
        EXTRAS.put("steps", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? new String[] {Manifest.permission.ACTIVITY_RECOGNITION} : new String[0]);
        EXTRAS.put("calls", new String[] {Manifest.permission.READ_CALL_LOG});
        EXTRAS.put("photos", new String[] {Build.VERSION.SDK_INT >= 33
            ? "android.permission.READ_MEDIA_IMAGES" : Manifest.permission.READ_EXTERNAL_STORAGE});
        EXTRAS.put("microphone", new String[] {Manifest.permission.RECORD_AUDIO});
        if (Build.VERSION.SDK_INT >= 31) {
            EXTRAS.put("bluetooth", new String[] {"android.permission.BLUETOOTH_CONNECT"});
        }
    }

    private static boolean allGranted(Context context, String[] permissions) {
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    /**
     * An optional signal (`kind`: steps, calls, photos, microphone, bluetooth): Android's own
     * question the first time; asked once already, the app's page in the settings, where every
     * permission is. The card reads the status again when the user comes back.
     */
    @PluginMethod
    public void allow(PluginCall call) {
        guarded(call, () -> {
            String kind = call.getString("kind", "");
            String[] permissions = EXTRAS.get(kind);
            Activity activity = getActivity();
            if (permissions == null || activity == null) {
                call.reject("Unknown signal: " + kind);
                return;
            }
            SensorsStore store = new SensorsStore(getContext());
            if (store.number("asked:" + kind) == 1) {
                Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                details.setData(Uri.parse("package:" + activity.getPackageName()));
                open(call, details);
                return;
            }
            store.setNumber("asked:" + kind, 1);
            ActivityCompat.requestPermissions(activity, permissions, EXTRA_REQUEST);
            call.resolve();
        });
    }

    /**
     * A plugin method that throws leaves the page's call waiting for good (Capacitor only logs
     * it): every method runs through here, so the page gets the error and can show it.
     */
    private interface Body {
        void run() throws Exception;
    }

    private static void guarded(PluginCall call, Body body) {
        try {
            body.run();
        } catch (Exception e) {
            call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        guarded(call, () -> statusNow(call));
    }

    private void statusNow(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("configured", new SensorsStore(context).configured());
        result.put("usageAccess", hasUsageAccess(context));
        result.put("notificationAccess", NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.getPackageName()));
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        result.put("unrestricted", power != null && power.isIgnoringBatteryOptimizations(context.getPackageName()));
        result.put("location", PhoneLocation.allowed(context));
        // The optional signals: each a permission of its own (see `allow`).
        for (Map.Entry<String, String[]> extra : EXTRAS.entrySet()) {
            result.put(extra.getKey(), allGranted(context, extra.getValue()));
        }
        call.resolve(result);
    }

    /** Switched on: the server and this phone's device token of the Activity section. */
    @PluginMethod
    public void configure(PluginCall call) {
        guarded(call, () -> configureNow(call));
    }

    private void configureNow(PluginCall call) {
        String server = call.getString("server", "");
        String token = call.getString("token", "");
        if (server.isEmpty() || token.isEmpty()) {
            call.reject("server and token are needed");
            return;
        }
        new SensorsStore(getContext()).configure(server, token);
        SensorsWorker.schedule(getContext());
        SensorsWorker.runNow(getContext());
        PlacesService.start(getContext());
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        guarded(call, () -> {
            SensorsWorker.cancel(getContext());
            new SensorsStore(getContext()).clear();
            call.resolve();
        });
    }

    @PluginMethod
    public void syncNow(PluginCall call) {
        guarded(call, () -> {
            SensorsWorker.runNow(getContext());
            call.resolve();
        });
    }

    @PluginMethod
    public void openUsageAccess(PluginCall call) {
        open(call, new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
    }

    @PluginMethod
    public void openNotificationAccess(PluginCall call) {
        open(call, new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
    }

    /** Android's own question: may the app run in the background without limits. */
    @PluginMethod
    public void openBattery(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        open(call, intent);
    }

    /**
     * The location "all the time": Android asks its own question the first time (Android 10
     * offers "Allow all the time" in it; 11 and later only "while using", so the rest is in the
     * settings). Asked once already, Android may stay silent: then the app's page in the
     * settings, where Permissions → Location has every choice. The card reads it again when the
     * user comes back.
     */
    @PluginMethod
    public void openLocation(PluginCall call) {
        guarded(call, () -> {
            Activity activity = getActivity();
            SensorsStore store = new SensorsStore(getContext());
            if (activity == null) {
                call.reject("The app is not on the screen");
                return;
            }
            boolean foreground = PhoneLocation.foregroundAllowed(activity);
            boolean asksBackground = Build.VERSION.SDK_INT == Build.VERSION_CODES.Q;
            if (store.askedLocation() || (foreground && !asksBackground)) {
                Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                details.setData(Uri.parse("package:" + activity.getPackageName()));
                open(call, details);
                return;
            }
            List<String> wanted = new ArrayList<>();
            if (!foreground) {
                wanted.add(Manifest.permission.ACCESS_FINE_LOCATION);
                wanted.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            }
            if (asksBackground) {
                wanted.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION);
            }
            store.markAskedLocation();
            ActivityCompat.requestPermissions(activity, wanted.toArray(new String[0]), LOCATION_REQUEST);
            call.resolve();
        });
    }

    /** MIUI keeps an app from starting by itself until it is allowed here; elsewhere — the app's page. */
    @PluginMethod
    public void openAutostart(PluginCall call) {
        open(call, new Intent().setComponent(new ComponentName(
            "com.miui.securitycenter",
            "com.miui.permcenter.autostart.AutoStartManagementActivity"
        )));
    }

    /**
     * Opens a settings screen from the app's own screen (MIUI is strict about starting one from
     * elsewhere); a phone without that screen gets the app's page in Android's settings, where
     * every permission is too.
     */
    private void open(PluginCall call, Intent intent) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The app is not on the screen");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(intent);
                call.resolve();
            } catch (ActivityNotFoundException | SecurityException e) {
                try {
                    Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    details.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(details);
                    call.resolve();
                } catch (RuntimeException again) {
                    call.reject(again.getClass().getSimpleName() + ": " + again.getMessage());
                }
            } catch (RuntimeException e) {
                call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        });
    }

    static boolean hasUsageAccess(Context context) {
        AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) {
            return false;
        }
        int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }
}
