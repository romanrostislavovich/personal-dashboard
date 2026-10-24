package com.personalworld.dashboard;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * The gentle day on the home screen: what the app last told it (GentleWidgetPlugin). A tap opens
 * the app on the gentle day. A day that has passed is not shown as today's: the widget asks to
 * open the app instead, until the app tells it the new day.
 */
public class GentleWidget extends AppWidgetProvider {

    /** Opened by a tap: the app's `appUrlOpen` listener goes to the gentle day. */
    private static final String OPEN = "personaldashboard://psychology/gentle";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, views(context));
        }
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, GentleWidget.class));
        for (int id : ids) {
            manager.updateAppWidget(id, views(context));
        }
    }

    private static RemoteViews views(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(GentleWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String date = prefs.getString("date", "");
        boolean today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()).equals(date);
        String title = prefs.getString("title", "");
        String lines = today ? prefs.getString("lines", "") : prefs.getString("stale", "");

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.gentle_widget);
        views.setTextViewText(R.id.gentle_title, title.isEmpty() ? context.getString(R.string.gentle_widget_title) : title);
        views.setTextViewText(R.id.gentle_lines, lines.isEmpty() ? context.getString(R.string.gentle_widget_open) : lines);

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(OPEN), context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(
            context,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.gentle_root, tap);
        return views;
    }
}
