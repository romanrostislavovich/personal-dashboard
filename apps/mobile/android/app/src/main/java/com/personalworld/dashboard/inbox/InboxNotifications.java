package com.personalworld.dashboard.inbox;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.personalworld.dashboard.MainActivity;
import com.personalworld.dashboard.R;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The bell's notifications in the shade, drawn by the app (PushMessagingService): a tap opens the
 * notification's card in the app; a question of up to three buttons is answered right there
 * (PushActionReceiver), and its notification then says what was answered. Each notification is
 * tagged with its id: the server takes it away once it is answered elsewhere.
 */
public final class InboxNotifications {

    /** The channel the server's push used before (PUSH_CHANNEL in contracts), with its sound. */
    static final String CHANNEL = "dashboard";
    /** With the id as the tag: one notification per notification of the bell. */
    private static final int NOTIFICATION = 1;
    /** An answered one stays this long to be read, then goes. */
    private static final long ANSWERED_STAYS_MS = 15_000;

    private InboxNotifications() {}

    /** `kind: show` of the server (PushService.richData). */
    static void show(Context context, Map<String, String> data) {
        String id = data.get("id");
        if (id == null) {
            return;
        }
        String title = orEmpty(data.get("title"));
        String body = orEmpty(data.get("body"));
        NotificationCompat.Builder builder = base(context, id, data.get("route"))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        String answerUrl = data.get("answerUrl");
        String token = data.get("answerToken");
        if (answerUrl != null && token != null) {
            try {
                JSONArray buttons = new JSONArray(orEmpty(data.get("buttons")));
                for (int i = 0; i < buttons.length(); i++) {
                    JSONObject button = buttons.getJSONObject(i);
                    Intent press = new Intent(context, PushActionReceiver.class)
                        .putExtra(PushActionReceiver.ID, id)
                        .putExtra(PushActionReceiver.TITLE, title)
                        .putExtra(PushActionReceiver.ROUTE, data.get("route"))
                        .putExtra(PushActionReceiver.ACTION, button.getString("action"))
                        .putExtra(PushActionReceiver.URL, answerUrl)
                        .putExtra(PushActionReceiver.TOKEN, token);
                    PendingIntent pending = PendingIntent.getBroadcast(
                        context, (id + i).hashCode(), press,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                    builder.addAction(0, button.getString("label"), pending);
                }
            } catch (JSONException e) {
                // No buttons then: the card has them.
            }
        }
        notify(context, id, builder);
    }

    /** `kind: close`: answered elsewhere, or the app's card answered it. */
    static void close(Context context, String id) {
        if (id != null) {
            NotificationManagerCompat.from(context).cancel(id, NOTIFICATION);
        }
    }

    /** After a press in the shade: what the section said back, without the buttons. */
    static void answered(Context context, String id, String title, String reply, String route) {
        notify(context, id, base(context, id, route)
            .setContentTitle(title)
            .setContentText(reply)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(reply))
            .setSilent(true)
            .setTimeoutAfter(ANSWERED_STAYS_MS));
    }

    /** The press did not reach the server: the card in the app answers it instead. */
    static void failed(Context context, String id, String title, String text, String route) {
        notify(context, id, base(context, id, route)
            .setContentTitle(title)
            .setContentText(text)
            .setSilent(true));
    }

    private static NotificationCompat.Builder base(Context context, String id, String route) {
        ensureChannel(context);
        // personaldashboard://notifications/<id>: the app opens the card (MobileAppService).
        Intent open = new Intent(Intent.ACTION_VIEW,
            Uri.parse("personaldashboard:/" + (route == null ? "/notifications/" + id : route)),
            context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, id.hashCode(), open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tap);
    }

    private static void notify(Context context, String id, NotificationCompat.Builder builder) {
        try {
            NotificationManagerCompat.from(context).notify(id, NOTIFICATION, builder.build());
        } catch (SecurityException e) {
            // Notifications are not allowed (Android 13+): the bell has it anyway.
        }
    }

    /** The web part makes the channel when push is switched on; a data message may come first. */
    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null && manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(
                new NotificationChannel(CHANNEL, "Personal Dashboard", NotificationManager.IMPORTANCE_HIGH));
        }
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }
}
