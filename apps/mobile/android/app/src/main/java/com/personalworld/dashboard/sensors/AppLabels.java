package com.personalworld.dashboard.sensors;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** The names people know apps by, and the home screens (time on them is not use of an app). */
final class AppLabels {

    private AppLabels() {}

    /** `com.instagram.android` → `Instagram`; the package name when the app is gone. */
    static String of(Context context, String app) {
        PackageManager manager = context.getPackageManager();
        try {
            ApplicationInfo info = manager.getApplicationInfo(app, 0);
            return manager.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return app;
        }
    }

    /** Every launcher on the phone (MIUI's and any other installed). */
    static Set<String> homeScreens(Context context) {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        List<ResolveInfo> launchers = context.getPackageManager().queryIntentActivities(home, 0);
        Set<String> packages = new HashSet<>();
        for (ResolveInfo launcher : launchers) {
            packages.add(launcher.activityInfo.packageName);
        }
        // The lock screen and the system bars come to the front too.
        packages.add("com.android.systemui");
        return packages;
    }
}
