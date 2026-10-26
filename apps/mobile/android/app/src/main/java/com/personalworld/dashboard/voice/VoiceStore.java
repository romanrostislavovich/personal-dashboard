package com.personalworld.dashboard.voice;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * The voice assistant's settings and its last turn, on the phone only: whether it listens, the
 * name it answers to, how the speech model is doing and the last question with its answer.
 */
public class VoiceStore {

    public static final String DEFAULT_NAME = "люцифер";

    private final SharedPreferences prefs;

    public VoiceStore(Context context) {
        prefs = context.getSharedPreferences("voice", Context.MODE_PRIVATE);
    }

    public boolean enabled() {
        return prefs.getBoolean("enabled", false);
    }

    public String name() {
        return prefs.getString("name", DEFAULT_NAME);
    }

    public void configure(boolean enabled, String name) {
        prefs.edit().putBoolean("enabled", enabled).putString("name", name).remove("known").apply();
    }

    /** Whether the model knows the name: `null` — not checked yet (no model). */
    public Boolean known() {
        return prefs.contains("known") ? prefs.getBoolean("known", false) : null;
    }

    public void setKnown(boolean known) {
        prefs.edit().putBoolean("known", known).apply();
    }

    /** `none`, `downloading`, `ready`, `failed`. */
    public String model() {
        return prefs.getString("model", "none");
    }

    public int progress() {
        return prefs.getInt("progress", 0);
    }

    public void setModel(String state, int progress) {
        prefs.edit().putString("model", state).putInt("progress", progress).apply();
    }

    public String error() {
        return prefs.getString("error", "");
    }

    public void setError(String error) {
        prefs.edit().putString("error", error == null ? "" : error).apply();
    }

    public String lastQuestion() {
        return prefs.getString("question", "");
    }

    public String lastAnswer() {
        return prefs.getString("answer", "");
    }

    public long lastAt() {
        return prefs.getLong("at", 0);
    }

    public void setLast(String question, String answer) {
        prefs.edit()
            .putString("question", question)
            .putString("answer", answer)
            .putLong("at", System.currentTimeMillis())
            .apply();
    }
}
