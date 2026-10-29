package com.personalworld.dashboard.inbox;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the page that this app draws the bell's notifications itself (PushMessagingService), so
 * it registers for data messages with buttons (`rich`, mobile-push.service.ts). An app built
 * before has no such plugin and gets plain notifications.
 */
@CapacitorPlugin(name = "NotificationShade")
public class NotificationShadePlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        JSObject result = new JSObject();
        result.put("rich", true);
        call.resolve(result);
    }
}
