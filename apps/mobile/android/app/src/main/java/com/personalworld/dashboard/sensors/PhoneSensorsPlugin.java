package com.personalworld.dashboard.sensors;

import android.app.AppOpsManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.os.Process;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone as a sensor, switched on and looked after from the page (`phone-sensors.ts` in
 * web-core): where to send and with which device token, what Android has allowed (the usage of
 * apps, the notifications, running in the background), and the settings screens to allow them.
 */
@CapacitorPlugin(name = "PhoneSensors")
public class PhoneSensorsPlugin extends Plugin {

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

    /** MIUI keeps an app from starting by itself until it is allowed here; elsewhere — the app's page. */
    @PluginMethod
    public void openAutostart(PluginCall call) {
        Intent miui = new Intent().setComponent(new ComponentName(
            "com.miui.securitycenter",
            "com.miui.permcenter.autostart.AutoStartManagementActivity"
        ));
        try {
            miui.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(miui);
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException e) {
            Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            details.setData(Uri.parse("package:" + getContext().getPackageName()));
            open(call, details);
        }
    }

    private void open(PluginCall call, Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("This phone has no such settings screen");
        } catch (RuntimeException e) {
            call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
        }
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
