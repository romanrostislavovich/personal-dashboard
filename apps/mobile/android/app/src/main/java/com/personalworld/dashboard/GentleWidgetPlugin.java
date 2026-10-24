package com.personalworld.dashboard;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The page tells the home-screen widget what to show (the gentle day: a title and up to three
 * lines, already in the user's language), see `gentle-widget.ts` in web-core. The text is kept
 * on the phone, so the widget shows it without the app running.
 */
@CapacitorPlugin(name = "GentleWidget")
public class GentleWidgetPlugin extends Plugin {

    static final String PREFS = "gentle_widget";

    @PluginMethod
    public void update(PluginCall call) {
        JSObject data = call.getData();
        Context context = getContext();
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editor.putString("date", data.getString("date", ""));
        editor.putString("title", data.getString("title", ""));
        editor.putString("lines", data.getString("lines", ""));
        editor.putString("stale", data.getString("stale", ""));
        editor.apply();
        GentleWidget.refreshAll(context);
        call.resolve();
    }
}
