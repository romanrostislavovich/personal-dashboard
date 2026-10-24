package com.personalworld.dashboard.sensors;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Every notification another app shows, written down with its title and text to be sent to the
 * dashboard (Activity → Notifications): which apps interrupt, when and how often. Runs only once
 * the user gives the app the access in Android's settings; the text goes to the server only,
 * where it is stored encrypted.
 */
public class PhoneNotificationListener extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification posted) {
        SensorsStore store = new SensorsStore(this);
        Notification notification = posted.getNotification();
        // Not sent: our own; a player or a download in progress (it stays, it does not ring);
        // the summary of a group (its notifications come one by one anyway).
        if (!store.configured()
            || getPackageName().equals(posted.getPackageName())
            || posted.isOngoing()
            || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
            return;
        }
        Bundle extras = notification.extras;
        try {
            JSONObject item = new JSONObject();
            item.put("app", posted.getPackageName());
            item.put("appName", AppLabels.of(this, posted.getPackageName()));
            item.put("title", text(extras, Notification.EXTRA_TITLE));
            item.put("text", text(extras, Notification.EXTRA_TEXT));
            item.put("postedAt", posted.getPostTime());
            store.queueNotification(item);
        } catch (JSONException e) {
            // Nothing that can be written down: skipped.
        }
    }

    private static String text(Bundle extras, String key) {
        CharSequence value = extras == null ? null : extras.getCharSequence(key);
        return value == null ? "" : value.toString();
    }
}
