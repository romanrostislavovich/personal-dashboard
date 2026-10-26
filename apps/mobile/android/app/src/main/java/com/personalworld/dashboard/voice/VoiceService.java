package com.personalworld.dashboard.voice;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.personalworld.dashboard.MainActivity;
import com.personalworld.dashboard.R;
import com.personalworld.dashboard.sensors.SensorsStore;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

/**
 * The voice assistant: listens all the time for its name, recognised on the phone by Vosk with a
 * grammar of that one word (nothing leaves the phone until the name is heard). Then a beep, the
 * question is recorded until a pause — with the second and a half before the name was caught, so
 * a question said in one breath keeps its start — and sent to the dashboard with the phone's
 * device token; the answer is read aloud and shown in a notification. When the assistant asks to
 * confirm, it listens again at once for the "yes" or "no". The audio is never kept.
 *
 * The microphone is open all the time here, so the noise level of the day is taken from it too
 * (LiveSignals asks `recentDb`) rather than from a second recording.
 */
public class VoiceService extends Service {

    private static final String TAG = "VoiceService";
    private static final String CHANNEL = "voice";
    private static final String ANSWERS = "voice-answers";
    private static final int NOTIFICATION_ID = 7302;
    private static final int ANSWER_ID = 7303;
    /** Wakes as if the name was heard (the "Try" button of the settings). */
    public static final String ACTION_TRY = "com.personalworld.dashboard.voice.TRY";

    private static final int RATE = 16_000;
    /** A tenth of a second: what is read from the microphone at a time. */
    private static final int CHUNK = RATE / 10;
    /** Audio kept from before the name was caught. */
    private static final int BEFORE_CHUNKS = 15;
    /** Silence that ends the question once something was said. */
    private static final int END_SILENCE_CHUNKS = 12;
    /** Nothing said this long after the beep: nothing is asked. */
    private static final int NOTHING_CHUNKS = 50;
    /** The longest question. */
    private static final int MAX_CHUNKS = 150;
    /** Louder than the room by this much is speech. */
    private static final double SPEECH_DB = 9;

    private static volatile double recentDb = Double.NaN;
    private static volatile long recentDbAt;

    private volatile boolean stopping;
    private volatile boolean tryNow;
    private volatile boolean speaking;
    private Thread worker;
    private TextToSpeech tts;
    private VoiceStore store;

    /** Listening when it is on, the phone set up and the microphone allowed; safe to call again. */
    public static void start(Context context) {
        if (!new VoiceStore(context).enabled() || !new SensorsStore(context).configured() || !hasMicrophone(context)) {
            return;
        }
        try {
            ContextCompat.startForegroundService(context, new Intent(context, VoiceService.class));
        } catch (RuntimeException e) {
            // Android 12 and later do not start it from the background: the app's next start does.
            Log.w(TAG, "The voice assistant did not start", e);
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, VoiceService.class));
    }

    /** The settings changed (the name): the recognizer is made anew. */
    public static void restart(Context context) {
        stop(context);
        start(context);
    }

    public static void tryNow(Context context) {
        Intent intent = new Intent(context, VoiceService.class).setAction(ACTION_TRY);
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (RuntimeException e) {
            Log.w(TAG, "The voice assistant did not start", e);
        }
    }

    /** The loudness around of the last minutes (dB, uncalibrated), while this service listens. */
    public static Double recentDb() {
        return System.currentTimeMillis() - recentDbAt < 5 * 60_000 && !Double.isNaN(recentDb) ? recentDb : null;
    }

    public static boolean hasMicrophone(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        store = new VoiceStore(this);
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.getDefault());
            }
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) {
                speaking = true;
            }

            @Override
            public void onDone(String id) {
                speaking = false;
                if (id.startsWith("confirm")) {
                    tryNow = true;
                }
            }

            @Override
            public void onError(String id) {
                speaking = false;
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = status(getString(R.string.voice_listening, store.name()));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        if (!store.enabled() || !new SensorsStore(this).configured() || !hasMicrophone(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_TRY.equals(intent.getAction())) {
            tryNow = true;
        }
        if (worker == null) {
            stopping = false;
            worker = new Thread(this::run, "voice");
            worker.start();
        }
        // Killed for memory: Android starts it again.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopping = true;
        if (worker != null) {
            worker.interrupt();
            worker = null;
        }
        if (tts != null) {
            tts.shutdown();
        }
        recentDb = Double.NaN;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void run() {
        VoiceModel model = new VoiceModel(this);
        try {
            if (!model.ready()) {
                notifyStatus(getString(R.string.voice_loading));
                store.setModel("downloading", 0);
                model.download(percent -> store.setModel("downloading", percent));
            }
            store.setModel("ready", 100);
            store.setKnown(model.knows(store.name()));
        } catch (IOException e) {
            Log.w(TAG, "The speech model was not downloaded", e);
            store.setModel("failed", 0);
            store.setError(e.getMessage());
            stopSelf();
            return;
        }
        notifyStatus(getString(R.string.voice_listening, store.name()));
        String name = store.name();
        int size = Math.max(AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), CHUNK * 2) * 2;
        AudioRecord microphone = null;
        try (Model vosk = new Model(model.path());
             Recognizer recognizer = new Recognizer(vosk, RATE, new JSONArray().put(name).put("[unk]").toString())) {
            microphone = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size);
            if (microphone.getState() != AudioRecord.STATE_INITIALIZED) {
                throw new IOException("The microphone is busy");
            }
            microphone.startRecording();
            store.setError("");
            ArrayDeque<short[]> before = new ArrayDeque<>();
            Loudness loudness = new Loudness();
            while (!stopping) {
                short[] chunk = new short[CHUNK];
                int read = microphone.read(chunk, 0, CHUNK);
                if (read <= 0) {
                    continue;
                }
                loudness.add(chunk, read);
                before.addLast(chunk);
                if (before.size() > BEFORE_CHUNKS) {
                    before.removeFirst();
                }
                if (speaking) {
                    // Its own voice is not a question.
                    continue;
                }
                boolean heard = tryNow || said(recognizer, chunk, read, name);
                if (!heard) {
                    continue;
                }
                boolean tried = tryNow;
                tryNow = false;
                recognizer.reset();
                ask(microphone, tried ? new ArrayDeque<>() : before, loudness.floor());
                before.clear();
                recognizer.reset();
                notifyStatus(getString(R.string.voice_listening, name));
            }
        } catch (IOException | RuntimeException e) {
            Log.w(TAG, "The voice assistant stopped", e);
            store.setError(e.getMessage());
        } finally {
            if (microphone != null) {
                try {
                    microphone.stop();
                } catch (RuntimeException e) {
                    // Never started.
                }
                microphone.release();
            }
        }
    }

    /** Whether the name is in what the recognizer has heard so far. */
    private static boolean said(Recognizer recognizer, short[] chunk, int read, String name) {
        String json = recognizer.acceptWaveForm(chunk, read) ? recognizer.getResult() : recognizer.getPartialResult();
        try {
            JSONObject result = new JSONObject(json);
            String text = result.optString("text", result.optString("partial", ""));
            for (String word : text.split("\\s+")) {
                if (word.equals(name)) {
                    return true;
                }
            }
        } catch (org.json.JSONException e) {
            // Nothing heard.
        }
        return false;
    }

    /** The question after the name: recorded until a pause, sent, and the answer said. */
    private void ask(AudioRecord microphone, ArrayDeque<short[]> before, double floorDb) {
        beep();
        notifyStatus(getString(R.string.voice_heard));
        ByteArrayOutputStream pcm = new ByteArrayOutputStream();
        for (short[] chunk : before) {
            write(pcm, chunk, chunk.length);
        }
        boolean spoke = false;
        int silent = 0;
        for (int i = 0; i < MAX_CHUNKS && !stopping; i++) {
            short[] chunk = new short[CHUNK];
            int read = microphone.read(chunk, 0, CHUNK);
            if (read <= 0) {
                continue;
            }
            write(pcm, chunk, read);
            boolean loud = Loudness.db(chunk, read) > floorDb + SPEECH_DB;
            if (loud) {
                spoke = true;
                silent = 0;
            } else if (spoke && ++silent >= END_SILENCE_CHUNKS) {
                break;
            }
            if (!spoke && i >= NOTHING_CHUNKS) {
                break;
            }
        }
        if (!spoke) {
            say(getString(R.string.voice_not_heard), "none");
            return;
        }
        notifyStatus(getString(R.string.voice_thinking));
        try {
            JSONObject answer = send(wav(pcm.toByteArray()));
            String text = answer.optString("answer", "");
            String question = answer.optString("question", "");
            store.setLast(question, text);
            showAnswer(question, text);
            say(text, answer.optBoolean("awaitsConfirmation") ? "confirm" : "answer");
        } catch (IOException | org.json.JSONException e) {
            Log.w(TAG, "The question was not answered", e);
            say(getString(R.string.voice_no_server), "none");
        }
    }

    private JSONObject send(byte[] wav) throws IOException, org.json.JSONException {
        SensorsStore sensors = new SensorsStore(this);
        String boundary = "voice" + System.nanoTime();
        HttpURLConnection connection = (HttpURLConnection) new URL(sensors.server() + "/api/activity/device/voice").openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(90_000);
        connection.setDoOutput(true);
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Authorization", "Device " + sensors.token());
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"audio\"; filename=\"voice.wav\"\r\n"
                + "Content-Type: audio/wav\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(wav);
            out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        }
        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) {
            throw new IOException("The dashboard answered " + code);
        }
        try (InputStream in = connection.getInputStream()) {
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) > 0) {
                body.write(buffer, 0, read);
            }
            return new JSONObject(body.toString("UTF-8"));
        } finally {
            connection.disconnect();
        }
    }

    private void say(String text, String kind) {
        if (text.isEmpty() || tts == null) {
            return;
        }
        speaking = true;
        Bundle params = new Bundle();
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, kind + System.nanoTime());
        // Until the answer is said, the microphone hears the phone itself: wait for it.
        long until = System.currentTimeMillis() + 60_000;
        while (speaking && !stopping && System.currentTimeMillis() < until) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private static void beep() {
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80);
            tone.startTone(ToneGenerator.TONE_PROP_BEEP, 150);
            Thread.sleep(200);
            tone.release();
        } catch (RuntimeException | InterruptedException e) {
            // Silent then.
        }
    }

    private static void write(ByteArrayOutputStream out, short[] samples, int count) {
        for (int i = 0; i < count; i++) {
            out.write(samples[i] & 0xff);
            out.write((samples[i] >> 8) & 0xff);
        }
    }

    /** 16-bit mono PCM as a WAV file. */
    private static byte[] wav(byte[] pcm) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(pcm.length + 44);
        int byteRate = RATE * 2;
        writeText(out, "RIFF");
        writeInt(out, 36 + pcm.length);
        writeText(out, "WAVE");
        writeText(out, "fmt ");
        writeInt(out, 16);
        writeShort(out, 1);
        writeShort(out, 1);
        writeInt(out, RATE);
        writeInt(out, byteRate);
        writeShort(out, 2);
        writeShort(out, 16);
        writeText(out, "data");
        writeInt(out, pcm.length);
        out.write(pcm, 0, pcm.length);
        return out.toByteArray();
    }

    private static void writeText(ByteArrayOutputStream out, String text) {
        byte[] bytes = text.getBytes(StandardCharsets.US_ASCII);
        out.write(bytes, 0, bytes.length);
    }

    private static void writeInt(ByteArrayOutputStream out, int value) {
        out.write(value & 0xff);
        out.write((value >> 8) & 0xff);
        out.write((value >> 16) & 0xff);
        out.write((value >> 24) & 0xff);
    }

    private static void writeShort(ByteArrayOutputStream out, int value) {
        out.write(value & 0xff);
        out.write((value >> 8) & 0xff);
    }

    private void notifyStatus(String title) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, status(title));
        }
    }

    private Notification status(String title) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            // Low: no sound, no pop-up, only a line in the shade.
            NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.voice_channel), NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(title)
            .setContentText(getString(R.string.voice_listening_text))
            .setContentIntent(openApp())
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    /** The question and the answer, to read again later. */
    private void showAnswer(String question, String answer) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(ANSWERS, getString(R.string.voice_answers_channel), NotificationManager.IMPORTANCE_DEFAULT);
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        }
        manager.notify(ANSWER_ID, new NotificationCompat.Builder(this, ANSWERS)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(question.isEmpty() ? store.name() : question)
            .setContentText(answer)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(answer))
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .build());
    }

    private PendingIntent openApp() {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent intent = new Intent(this, MainActivity.class)
            .setData(android.net.Uri.parse("personaldashboard://ai"));
        return PendingIntent.getActivity(this, 1, intent, flags);
    }

    /**
     * The level of the room: the noise floor speech is told apart from (the quietest tenth of the
     * last seconds), and the loudness of the last three seconds for the day's noise number.
     */
    private static class Loudness {
        private final double[] recent = new double[50];
        private int count;
        private double sum;
        private long samples;
        private long since = System.currentTimeMillis();

        void add(short[] chunk, int read) {
            double db = db(chunk, read);
            recent[count++ % recent.length] = db;
            for (int i = 0; i < read; i++) {
                sum += (double) chunk[i] * chunk[i];
            }
            samples += read;
            if (System.currentTimeMillis() - since >= 3_000 && samples > 0 && sum > 0) {
                double rms = Math.sqrt(sum / samples) / 32768.0;
                recentDb = 20 * Math.log10(rms) + 90;
                recentDbAt = System.currentTimeMillis();
                sum = 0;
                samples = 0;
                since = System.currentTimeMillis();
            }
        }

        double floor() {
            int n = Math.min(count, recent.length);
            if (n == 0) {
                return 30;
            }
            double[] sorted = java.util.Arrays.copyOf(recent, n);
            java.util.Arrays.sort(sorted);
            return sorted[n / 10];
        }

        static double db(short[] chunk, int read) {
            double sum = 0;
            for (int i = 0; i < read; i++) {
                sum += (double) chunk[i] * chunk[i];
            }
            double rms = Math.sqrt(sum / Math.max(read, 1)) / 32768.0;
            return rms <= 0 ? 0 : 20 * Math.log10(rms) + 90;
        }
    }
}
