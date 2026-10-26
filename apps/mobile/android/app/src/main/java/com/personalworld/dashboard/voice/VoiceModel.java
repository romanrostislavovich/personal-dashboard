package com.personalworld.dashboard.voice;

import android.content.Context;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * The speech model Vosk hears the name with: the small Russian one (~45 MB), downloaded once
 * from alphacephei.com into the app's own files — not in the APK, which stays small and installs
 * the same for a phone that never turns the voice on.
 */
public class VoiceModel {

    private static final String URL_RU =
        "https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip";
    /** The zip's size, for the progress: the server does not always tell it. */
    private static final long EXPECTED_BYTES = 46_236_750L;

    public interface Progress {
        void at(int percent);
    }

    private final File dir;

    public VoiceModel(Context context) {
        dir = new File(context.getFilesDir(), "vosk-ru");
    }

    public String path() {
        return dir.getAbsolutePath();
    }

    public boolean ready() {
        return new File(dir, "done").exists();
    }

    /** Downloads and unpacks the model (its top folder dropped); a half-done one is started over. */
    public void download(Progress progress) throws IOException {
        File parts = new File(dir.getParentFile(), "vosk-ru.part");
        deleteAll(parts);
        deleteAll(dir);
        HttpURLConnection connection = (HttpURLConnection) new URL(URL_RU).openConnection();
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(60_000);
        try (InputStream raw = new BufferedInputStream(connection.getInputStream());
             CountingStream counted = new CountingStream(raw);
             ZipInputStream zip = new ZipInputStream(counted)) {
            long total = connection.getContentLengthLong() > 0 ? connection.getContentLengthLong() : EXPECTED_BYTES;
            byte[] buffer = new byte[64 * 1024];
            int last = -1;
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                int slash = name.indexOf('/');
                String inner = slash < 0 ? "" : name.substring(slash + 1);
                if (inner.isEmpty() || inner.contains("..")) {
                    continue;
                }
                File out = new File(parts, inner);
                if (entry.isDirectory()) {
                    out.mkdirs();
                    continue;
                }
                out.getParentFile().mkdirs();
                try (OutputStream file = new FileOutputStream(out)) {
                    int read;
                    while ((read = zip.read(buffer)) > 0) {
                        file.write(buffer, 0, read);
                        int percent = (int) Math.min(99, counted.count * 100 / total);
                        if (percent != last) {
                            last = percent;
                            progress.at(percent);
                        }
                    }
                }
            }
        } finally {
            connection.disconnect();
        }
        if (!new File(parts, "am/final.mdl").exists() || !parts.renameTo(dir)) {
            deleteAll(parts);
            throw new IOException("The speech model is incomplete");
        }
        new FileOutputStream(new File(dir, "done")).close();
        progress.at(100);
    }

    /** Whether the model knows a word (see `known`). */
    public boolean knows(String word) throws IOException {
        return !known(java.util.Collections.singletonList(word)).isEmpty();
    }

    /**
     * The words of a list the model knows: Vosk hears only the words of its vocabulary. The small
     * models keep it as the symbol table inside `graph/Gr.fst` — each word as its length (4 bytes,
     * little-endian) and its UTF-8 letters — so each word is looked for in that form, all in one
     * pass over the file.
     */
    public java.util.List<String> known(java.util.List<String> words) throws IOException {
        java.util.List<String> found = new java.util.ArrayList<>();
        File graph = new File(dir, "graph/Gr.fst");
        if (!graph.exists()) {
            // A model of another kind: nothing to check by, so all are taken as known.
            found.addAll(words);
            return found;
        }
        byte[][] patterns = new byte[words.size()][];
        int longest = 0;
        for (int i = 0; i < words.size(); i++) {
            byte[] letters = words.get(i).getBytes(StandardCharsets.UTF_8);
            byte[] pattern = new byte[letters.length + 4];
            pattern[0] = (byte) letters.length;
            pattern[1] = (byte) (letters.length >> 8);
            pattern[2] = (byte) (letters.length >> 16);
            pattern[3] = (byte) (letters.length >> 24);
            System.arraycopy(letters, 0, pattern, 4, letters.length);
            patterns[i] = pattern;
            longest = Math.max(longest, pattern.length);
        }
        boolean[] seen = new boolean[words.size()];
        byte[] chunk = new byte[1 << 20];
        int filled = 0;
        try (InputStream in = new BufferedInputStream(new FileInputStream(graph))) {
            int read;
            while ((read = in.read(chunk, filled, chunk.length - filled)) > 0) {
                int end = filled + read;
                for (int i = 0; i < patterns.length; i++) {
                    seen[i] = seen[i] || indexOf(chunk, end, patterns[i]) >= 0;
                }
                // The end of this chunk may begin a word: it is kept for the next one.
                int tail = Math.min(longest - 1, end);
                System.arraycopy(chunk, end - tail, chunk, 0, tail);
                filled = tail;
            }
        }
        for (int i = 0; i < seen.length; i++) {
            if (seen[i]) {
                found.add(words.get(i));
            }
        }
        return found;
    }

    private static int indexOf(byte[] data, int length, byte[] pattern) {
        outer:
        for (int i = 0; i <= length - pattern.length; i++) {
            for (int j = 0; j < pattern.length; j++) {
                if (data[i + j] != pattern[j]) {
                    continue outer;
                }
            }
            return i;
        }
        return -1;
    }

    private static void deleteAll(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteAll(child);
            }
        }
        file.delete();
    }

    /** The bytes read from the network, for the progress. */
    private static class CountingStream extends java.io.FilterInputStream {
        long count;

        CountingStream(InputStream in) {
            super(in);
        }

        @Override
        public int read() throws IOException {
            int value = super.read();
            if (value >= 0) {
                count++;
            }
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int read = super.read(buffer, offset, length);
            if (read > 0) {
                count += read;
            }
            return read;
        }
    }
}
