package com.personalworld.dashboard.sensors;

import android.app.AppOpsManager;
import android.app.KeyguardManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import java.io.File;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The phone's security report, once a day (Security → Phone in the dashboard): the system and its
 * patch, the screen lock, encryption, root, developer options and USB debugging; the apps that are
 * device administrators, have an accessibility service on, may install other apps or came from
 * somewhere other than Google Play; the certificate authorities added by hand; the Wi-Fi it is on
 * and a VPN. Names of apps are sent so the security agent can judge them; nothing else of the apps.
 */
final class PhoneSecurity {

    private static final String TAG = "PhoneSecurity";
    private static final String PLAY = "com.android.vending";
    private static final String[] SU_PATHS = {
        "/system/bin/su", "/system/xbin/su", "/sbin/su", "/su/bin/su", "/system/sd/xbin/su",
        "/data/local/xbin/su", "/data/local/bin/su", "/system/app/Superuser.apk", "/data/adb/magisk",
    };

    private PhoneSecurity() {}

    static JSONObject report(Context context) throws JSONException {
        PackageManager packages = context.getPackageManager();
        ContentResolver resolver = context.getContentResolver();
        JSONObject report = new JSONObject()
            .put("at", iso(System.currentTimeMillis()))
            .put("android", new JSONObject()
                .put("release", Build.VERSION.RELEASE)
                .put("sdk", Build.VERSION.SDK_INT)
                .put("securityPatch", Build.VERSION.SECURITY_PATCH == null ? "" : Build.VERSION.SECURITY_PATCH)
                .put("model", Build.MODEL))
            .put("screenLock", screenLock(context))
            .put("encrypted", encrypted(context))
            .put("rooted", rooted())
            .put("developerOptions", Settings.Global.getInt(resolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1)
            .put("usbDebugging", Settings.Global.getInt(resolver, Settings.Global.ADB_ENABLED, 0) == 1)
            .put("deviceAdmins", deviceAdmins(context, packages))
            .put("accessibility", accessibility(context, packages, resolver))
            .put("userCertificates", userCertificates())
            .put("wifi", wifi(context))
            .put("vpn", vpn(context));
        JSONArray installers = new JSONArray();
        JSONArray notFromPlay = new JSONArray();
        appsOfConcern(context, packages, installers, notFromPlay);
        return report.put("installers", installers).put("notFromPlay", notFromPlay);
    }

    private static boolean screenLock(Context context) {
        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    /** Encrypted with the user's lock; a default key (no lock) is as good as none. `null` — not told. */
    private static Object encrypted(Context context) {
        DevicePolicyManager policy = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
        if (policy == null) {
            return JSONObject.NULL;
        }
        int status = policy.getStorageEncryptionStatus();
        return status == DevicePolicyManager.ENCRYPTION_STATUS_ACTIVE
            || status == DevicePolicyManager.ENCRYPTION_STATUS_ACTIVE_PER_USER;
    }

    private static boolean rooted() {
        if (Build.TAGS != null && Build.TAGS.contains("test-keys")) {
            return true;
        }
        for (String path : SU_PATHS) {
            if (new File(path).exists()) {
                return true;
            }
        }
        return false;
    }

    private static JSONArray deviceAdmins(Context context, PackageManager packages) throws JSONException {
        JSONArray apps = new JSONArray();
        DevicePolicyManager policy = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
        List<ComponentName> admins = policy == null ? null : policy.getActiveAdmins();
        if (admins == null) {
            return apps;
        }
        Set<String> seen = new LinkedHashSet<>();
        for (ComponentName admin : admins) {
            String pkg = admin.getPackageName();
            if (seen.add(pkg) && !isSystem(packages, pkg)) {
                apps.put(app(context, pkg));
            }
        }
        return apps;
    }

    private static JSONArray accessibility(Context context, PackageManager packages, ContentResolver resolver)
        throws JSONException {
        JSONArray apps = new JSONArray();
        String enabled = Settings.Secure.getString(resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null || enabled.isEmpty()) {
            return apps;
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String service : enabled.split(":")) {
            ComponentName component = ComponentName.unflattenFromString(service);
            if (component != null && seen.add(component.getPackageName())) {
                apps.put(app(context, component.getPackageName()));
            }
        }
        return apps;
    }

    /**
     * The installed apps (the system's own left out) that may install others, and the ones that did
     * not come from Google Play — with what installed them.
     */
    @SuppressWarnings("deprecation")
    private static void appsOfConcern(Context context, PackageManager packages, JSONArray installers,
        JSONArray notFromPlay) throws JSONException {
        AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
        for (PackageInfo info : packages.getInstalledPackages(PackageManager.GET_PERMISSIONS)) {
            ApplicationInfo application = info.applicationInfo;
            if (application == null || (application.flags & ApplicationInfo.FLAG_SYSTEM) != 0) {
                continue;
            }
            String pkg = info.packageName;
            if (!pkg.equals(context.getPackageName()) && requests(info, "android.permission.REQUEST_INSTALL_PACKAGES")
                && ops != null && mayInstall(ops, application.uid, pkg)) {
                installers.put(app(context, pkg));
            }
            String installer = installerOf(packages, pkg);
            if (!PLAY.equals(installer)) {
                notFromPlay.put(app(context, pkg).put("installer", installer == null ? JSONObject.NULL : installer));
            }
        }
    }

    @SuppressWarnings("deprecation")
    private static boolean mayInstall(AppOpsManager ops, int uid, String pkg) {
        try {
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? ops.unsafeCheckOpNoThrow("android:request_install_packages", uid, pkg)
                : ops.checkOpNoThrow("android:request_install_packages", uid, pkg);
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static boolean requests(PackageInfo info, String permission) {
        if (info.requestedPermissions == null) {
            return false;
        }
        for (String requested : info.requestedPermissions) {
            if (permission.equals(requested)) {
                return true;
            }
        }
        return false;
    }

    @SuppressWarnings("deprecation")
    private static String installerOf(PackageManager packages, String pkg) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                return packages.getInstallSourceInfo(pkg).getInstallingPackageName();
            }
            return packages.getInstallerPackageName(pkg);
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean isSystem(PackageManager packages, String pkg) {
        try {
            return (packages.getApplicationInfo(pkg, 0).flags & ApplicationInfo.FLAG_SYSTEM) != 0;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Certificate authorities added by the user (the system's own are "system:"). */
    private static JSONArray userCertificates() {
        JSONArray names = new JSONArray();
        try {
            KeyStore store = KeyStore.getInstance("AndroidCAStore");
            store.load(null);
            Enumeration<String> aliases = store.aliases();
            while (aliases.hasMoreElements()) {
                String alias = aliases.nextElement();
                if (alias.startsWith("user:")) {
                    names.put(alias);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "The certificates were not read", e);
        }
        return names;
    }

    /** The Wi-Fi it is on and whether it has no password; `null` — not on Wi-Fi or not told. */
    @SuppressWarnings("deprecation")
    private static Object wifi(Context context) throws JSONException {
        WifiManager manager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (manager == null) {
            return JSONObject.NULL;
        }
        try {
            WifiInfo info = manager.getConnectionInfo();
            if (info == null || info.getNetworkId() == -1 || info.getBSSID() == null) {
                return JSONObject.NULL;
            }
            String name = info.getSSID() == null ? "" : info.getSSID().replace("\"", "");
            for (ScanResult result : manager.getScanResults()) {
                if (info.getBSSID().equalsIgnoreCase(result.BSSID)) {
                    String security = result.capabilities == null ? "" : result.capabilities;
                    boolean open = !security.contains("WPA") && !security.contains("WEP") && !security.contains("SAE")
                        && !security.contains("EAP");
                    return new JSONObject().put("name", name).put("open", open);
                }
            }
        } catch (SecurityException e) {
            // No location permission: the network is not told.
        }
        return JSONObject.NULL;
    }

    private static boolean vpn(Context context) {
        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity == null) {
            return false;
        }
        Network network = connectivity.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : connectivity.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
    }

    private static JSONObject app(Context context, String pkg) throws JSONException {
        return new JSONObject().put("package", pkg).put("name", AppLabels.of(context, pkg));
    }

    private static String iso(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }
}
