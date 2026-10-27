package com.personalworld.dashboard;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * "Share" from any app into the dashboard: Android hands MainActivity a link, a text or a
 * picture, and the page (`share-target.ts` in web-core) takes it and offers where it goes — the
 * same commands as the desktop app's capture (a task, a diary note, a diary photo…).
 *
 * The share waits here until the page takes it: the app may be starting when it comes.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    /** A diary photo is at most 10 MB (DIARY_PHOTO_MAX_BYTES); larger pictures are not read. */
    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;

    private static JSObject pending;
    private static ShareTargetPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** From MainActivity: a share intent, kept for the page and announced to a page that runs. */
    static void receive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return;
        }
        JSObject share = read(context, intent);
        if (share == null) {
            return;
        }
        pending = share;
        // Handled once: a restart of the activity must not share it again.
        intent.setAction(Intent.ACTION_MAIN);
        if (instance != null) {
            instance.notifyListeners("shared", new JSObject(), true);
        }
    }

    /** The waiting share, or nothing: `{ share: { text, subject, image, mimeType } | null }`. */
    @PluginMethod
    public void take(PluginCall call) {
        JSObject result = new JSObject();
        result.put("share", pending);
        pending = null;
        call.resolve(result);
    }

    private static JSObject read(Context context, Intent intent) {
        JSObject share = new JSObject();
        String type = intent.getType() == null ? "" : intent.getType();
        if (type.startsWith("image/")) {
            String image = readImage(context, intent.getParcelableExtra(Intent.EXTRA_STREAM));
            if (image == null) {
                return null;
            }
            share.put("image", image);
            share.put("mimeType", type);
            return share;
        }
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text == null || text.toString().trim().isEmpty()) {
            return null;
        }
        share.put("text", text.toString().trim());
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject != null && !subject.trim().isEmpty()) {
            share.put("subject", subject.trim());
        }
        return share;
    }

    /** The picture as Base64; null when it cannot be read or is too large. */
    private static String readImage(Context context, Uri uri) {
        if (uri == null) {
            return null;
        }
        try (InputStream in = context.getContentResolver().openInputStream(uri)) {
            if (in == null) {
                return null;
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            for (int read = in.read(buffer); read > 0; read = in.read(buffer)) {
                bytes.write(buffer, 0, read);
                if (bytes.size() > MAX_IMAGE_BYTES) {
                    return null;
                }
            }
            return Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }
}
