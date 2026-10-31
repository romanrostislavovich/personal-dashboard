package com.personalworld.dashboard.inbox;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.personalworld.dashboard.sensors.SensorsWorker;
import java.util.Map;

/**
 * Firebase's messages to the app, in place of the push plugin's own service (the manifest swaps
 * them): the bell's data messages (`pd: 1`) are drawn here — with buttons in the shade — or taken
 * away; anything else, and the new tokens, go to the plugin as before.
 */
public class PushMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (!"1".equals(data.get("pd"))) {
            super.onMessageReceived(message);
            return;
        }
        if ("close".equals(data.get("kind"))) {
            InboxNotifications.close(this, data.get("id"));
        } else if ("revive".equals(data.get("kind"))) {
            // Silent: the server's watchdog heard nothing for long (PhoneWatchdogService).
            SensorsWorker.revive(this);
        } else {
            InboxNotifications.show(this, data);
        }
    }
}
