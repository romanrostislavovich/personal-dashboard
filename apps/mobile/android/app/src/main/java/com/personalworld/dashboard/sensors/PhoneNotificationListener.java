package com.personalworld.dashboard.sensors;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Every notification another app shows, written down with its title and text to be sent to the
 * dashboard (Activity → Phone): which apps interrupt, when and how often. Runs only once the user
 * gives the app the access in Android's settings; the text goes to the server only, where it is
 * stored encrypted. The same access tells what the players play and Do Not Disturb.
 */
public class PhoneNotificationListener extends NotificationListenerService {

    /** The players followed now, by their session (docs/telemetry.md, the phone's collector 4). */
    private final Map<MediaSession.Token, MediaController.Callback> players = new HashMap<>();
    private MediaSessionManager.OnActiveSessionsChangedListener sessionsListener;
    /** What each player last told, so the same "playing" is not written twice. */
    private final Map<String, String> lastTold = new HashMap<>();

    @Override
    public void onListenerConnected() {
        MediaSessionManager sessions = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
        ComponentName self = new ComponentName(this, PhoneNotificationListener.class);
        if (sessions != null) {
            sessionsListener = this::follow;
            try {
                sessions.addOnActiveSessionsChangedListener(sessionsListener, self);
                follow(sessions.getActiveSessions(self));
            } catch (SecurityException e) {
                sessionsListener = null;
            }
        }
        // Collector 5: Do Not Disturb as it is now, then each change.
        onInterruptionFilterChanged(getCurrentInterruptionFilter());
    }

    @Override
    public void onListenerDisconnected() {
        MediaSessionManager sessions = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
        if (sessions != null && sessionsListener != null) {
            sessions.removeOnActiveSessionsChangedListener(sessionsListener);
        }
        players.clear();
    }

    @Override
    public void onInterruptionFilterChanged(int filter) {
        SensorsStore store = new SensorsStore(this);
        if (!store.configured()) {
            return;
        }
        try {
            store.queueSignal("dnd", System.currentTimeMillis(),
                new JSONObject().put("on", filter != INTERRUPTION_FILTER_ALL && filter != INTERRUPTION_FILTER_UNKNOWN));
        } catch (JSONException e) {
            // Skipped.
        }
    }

    /** Follows each player that is there now; the ones gone are let go. */
    private void follow(List<MediaController> controllers) {
        if (controllers == null) {
            return;
        }
        for (MediaController controller : controllers) {
            if (players.containsKey(controller.getSessionToken())) {
                continue;
            }
            MediaController.Callback callback = new MediaController.Callback() {
                @Override
                public void onPlaybackStateChanged(PlaybackState state) {
                    tell(controller);
                }

                @Override
                public void onMetadataChanged(MediaMetadata metadata) {
                    tell(controller);
                }
            };
            controller.registerCallback(callback);
            players.put(controller.getSessionToken(), callback);
            tell(controller);
        }
    }

    /** What plays: the app, the title and the artist, playing or not — no audio, no picture. */
    private void tell(MediaController controller) {
        SensorsStore store = new SensorsStore(this);
        if (!store.configured()) {
            return;
        }
        PlaybackState state = controller.getPlaybackState();
        MediaMetadata metadata = controller.getMetadata();
        boolean playing = state != null && state.getState() == PlaybackState.STATE_PLAYING;
        String title = metadata == null ? "" : orEmpty(metadata.getString(MediaMetadata.METADATA_KEY_TITLE));
        String artist = metadata == null ? "" : orEmpty(metadata.getString(MediaMetadata.METADATA_KEY_ARTIST));
        String app = controller.getPackageName();
        String told = playing + "|" + title + "|" + artist;
        if (told.equals(lastTold.get(app))) {
            return;
        }
        lastTold.put(app, told);
        try {
            store.queueSignal("media", System.currentTimeMillis(), new JSONObject()
                .put("app", app)
                .put("appName", AppLabels.of(this, app))
                .put("playing", playing)
                .put("title", title)
                .put("artist", artist));
        } catch (JSONException e) {
            // Skipped.
        }
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }

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

    /**
     * Collector 15: what was done with a notification — opened (tapped) or swiped away, and how
     * many seconds after it came. Removed by its app, or by a timeout, is no reaction.
     */
    @Override
    public void onNotificationRemoved(StatusBarNotification removed, RankingMap ranking, int reason) {
        String reaction = reason == REASON_CLICK ? "opened"
            : reason == REASON_CANCEL || reason == REASON_CANCEL_ALL ? "dismissed" : null;
        SensorsStore store = new SensorsStore(this);
        if (reaction == null || !store.configured() || getPackageName().equals(removed.getPackageName())
            || removed.isOngoing()) {
            return;
        }
        long now = System.currentTimeMillis();
        try {
            store.queueSignal("notificationReaction", now, new JSONObject()
                .put("app", removed.getPackageName())
                .put("reaction", reaction)
                .put("seconds", Math.max(0, (now - removed.getPostTime()) / 1000)));
        } catch (JSONException e) {
            // Skipped.
        }
    }

    private static String text(Bundle extras, String key) {
        CharSequence value = extras == null ? null : extras.getCharSequence(key);
        return value == null ? "" : value.toString();
    }
}
