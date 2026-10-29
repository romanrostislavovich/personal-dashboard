package com.personalworld.dashboard.inbox;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.personalworld.dashboard.R;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * A button pressed in the shade: the answer goes to the server without opening the app — with the
 * key the notification carried, which fits that notification alone — and the notification then
 * says what the section answered ("Saved: 8/10"). Without a network it says so, and a tap opens
 * the card to answer there.
 */
public class PushActionReceiver extends BroadcastReceiver {

    static final String ID = "id";
    static final String TITLE = "title";
    static final String ROUTE = "route";
    static final String ACTION = "action";
    static final String URL = "url";
    static final String TOKEN = "token";
    private static final int TIMEOUT_MS = 15_000;

    @Override
    public void onReceive(Context context, Intent intent) {
        PendingResult pending = goAsync();
        Context app = context.getApplicationContext();
        String id = intent.getStringExtra(ID);
        String title = intent.getStringExtra(TITLE);
        String route = intent.getStringExtra(ROUTE);
        new Thread(() -> {
            try {
                String reply = send(intent.getStringExtra(URL), intent.getStringExtra(ACTION),
                    intent.getStringExtra(TOKEN));
                InboxNotifications.answered(app, id, title, reply, route);
            } catch (Exception e) {
                InboxNotifications.failed(app, id, title, app.getString(R.string.inbox_not_sent), route);
            } finally {
                pending.finish();
            }
        }, "push-answer").start();
    }

    /** The server's reply to the press (`InboxAnswerResult.reply`). */
    private static String send(String url, String action, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            byte[] body = new JSONObject().put("action", action).put("token", token).toString()
                .getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body);
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("HTTP " + status);
            }
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                for (int read = in.read(buffer); read > 0; read = in.read(buffer)) {
                    bytes.write(buffer, 0, read);
                }
                return new JSONObject(bytes.toString("UTF-8")).optString("reply", "✓");
            }
        } finally {
            connection.disconnect();
        }
    }
}
