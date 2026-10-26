package com.personalworld.dashboard.sensors;

import android.Manifest;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.util.Log;
import androidx.core.content.ContextCompat;
import org.json.JSONException;
import org.json.JSONObject;
import com.personalworld.dashboard.voice.VoiceService;

/**
 * The phone's signals heard as they happen, while PlacesService runs (docs/telemetry.md, the
 * phone's collectors 1, 3, 5, 9, 10): charging, the ringer, Wi-Fi and Bluetooth, and every quarter
 * of an hour the light, the air pressure (if the phone has a barometer) and the noise level — a
 * number of decibels from three seconds, never a sound kept.
 */
final class LiveSignals {

    private static final String TAG = "LiveSignals";
    private static final int SAMPLE_RATE = 16_000;
    private static final int NOISE_MS = 3_000;

    private final Context context;
    private final SensorsStore store;
    private BroadcastReceiver receiver;
    private ConnectivityManager.NetworkCallback network;
    private String wifiNow;

    LiveSignals(Context context) {
        this.context = context.getApplicationContext();
        this.store = new SensorsStore(this.context);
    }

    static boolean hasMicrophone(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
    }

    void start() {
        if (receiver != null) {
            return;
        }
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                heard(intent);
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_POWER_CONNECTED);
        filter.addAction(Intent.ACTION_POWER_DISCONNECTED);
        filter.addAction(AudioManager.RINGER_MODE_CHANGED_ACTION);
        filter.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        filter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        context.registerReceiver(receiver, filter);

        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity != null) {
            network = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onCapabilitiesChanged(Network n, NetworkCapabilities capabilities) {
                    if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                        wifi(currentSsid());
                    } else {
                        wifi(null);
                    }
                }

                @Override
                public void onLost(Network n) {
                    wifi(null);
                }
            };
            try {
                connectivity.registerDefaultNetworkCallback(network);
            } catch (RuntimeException e) {
                Log.w(TAG, "The network is not followed", e);
                network = null;
            }
        }
    }

    void stop() {
        if (receiver != null) {
            try {
                context.unregisterReceiver(receiver);
            } catch (IllegalArgumentException e) {
                // Not registered any more.
            }
            receiver = null;
        }
        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity != null && network != null) {
            connectivity.unregisterNetworkCallback(network);
            network = null;
        }
    }

    private void heard(Intent intent) {
        String action = intent.getAction();
        long now = System.currentTimeMillis();
        try {
            if (Intent.ACTION_POWER_CONNECTED.equals(action) || Intent.ACTION_POWER_DISCONNECTED.equals(action)) {
                store.queueSignal("charging", now, new JSONObject()
                    .put("on", Intent.ACTION_POWER_CONNECTED.equals(action))
                    .put("level", batteryLevel()));
            } else if (AudioManager.RINGER_MODE_CHANGED_ACTION.equals(action)) {
                int mode = intent.getIntExtra(AudioManager.EXTRA_RINGER_MODE, AudioManager.RINGER_MODE_NORMAL);
                store.queueSignal("ringer", now, new JSONObject().put("mode",
                    mode == AudioManager.RINGER_MODE_SILENT ? "silent"
                        : mode == AudioManager.RINGER_MODE_VIBRATE ? "vibrate" : "normal"));
            } else if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(action)
                || BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) {
                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                store.queueSignal("bluetooth", now, new JSONObject()
                    .put("connected", BluetoothDevice.ACTION_ACL_CONNECTED.equals(action))
                    .put("name", deviceName(device))
                    .put("kind", deviceKind(device)));
            }
        } catch (JSONException e) {
            // Skipped.
        }
    }

    private int batteryLevel() {
        BatteryManager battery = (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
        return battery == null ? -1 : battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
    }

    private String deviceName(BluetoothDevice device) {
        try {
            return device == null || device.getName() == null ? "" : device.getName();
        } catch (SecurityException e) {
            return "";
        }
    }

    /** A car, headphones or something else, by the class the device tells about itself. */
    private String deviceKind(BluetoothDevice device) {
        try {
            BluetoothClass type = device == null ? null : device.getBluetoothClass();
            if (type == null) {
                return "other";
            }
            switch (type.getDeviceClass()) {
                case BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO:
                case BluetoothClass.Device.AUDIO_VIDEO_HANDSFREE:
                    return "car";
                case BluetoothClass.Device.AUDIO_VIDEO_HEADPHONES:
                case BluetoothClass.Device.AUDIO_VIDEO_WEARABLE_HEADSET:
                case BluetoothClass.Device.AUDIO_VIDEO_PORTABLE_AUDIO:
                    return "headphones";
                case BluetoothClass.Device.AUDIO_VIDEO_LOUDSPEAKER:
                    return "speaker";
                default:
                    return type.getMajorDeviceClass() == BluetoothClass.Device.Major.WEARABLE ? "wearable" : "other";
            }
        } catch (SecurityException e) {
            return "other";
        }
    }

    @SuppressWarnings("deprecation")
    private String currentSsid() {
        WifiManager wifi = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        WifiInfo info = wifi == null ? null : wifi.getConnectionInfo();
        String ssid = info == null ? null : info.getSSID();
        if (ssid == null || "<unknown ssid>".equals(ssid)) {
            return "";
        }
        return ssid.replaceAll("^\"|\"$", "");
    }

    /** Only a change is written down: joined a network (its name), or left Wi-Fi. */
    private synchronized void wifi(String ssid) {
        String now = ssid == null ? "" : ssid;
        if (now.equals(wifiNow)) {
            return;
        }
        wifiNow = now;
        try {
            store.queueSignal("wifi", System.currentTimeMillis(),
                new JSONObject().put("ssid", now.isEmpty() ? JSONObject.NULL : now));
        } catch (JSONException e) {
            // Skipped.
        }
    }

    /** Every quarter of an hour: the light, the pressure, the noise. */
    void sample() {
        long now = System.currentTimeMillis();
        SensorManager sensors = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        try {
            Sensor light = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_LIGHT);
            Float lux = light == null ? null : PhoneSignals.readOnce(sensors, light);
            if (lux != null) {
                store.queueSignal("light", now, new JSONObject().put("lux", Math.round(lux)));
            }
            Sensor pressure = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_PRESSURE);
            Float hpa = pressure == null ? null : PhoneSignals.readOnce(sensors, pressure);
            if (hpa != null) {
                store.queueSignal("pressure", now, new JSONObject().put("hpa", Math.round(hpa * 10) / 10.0));
            }
            Double db = noise();
            if (db != null) {
                store.queueSignal("noise", now, new JSONObject().put("db", Math.round(db)));
            }
        } catch (JSONException e) {
            // Skipped.
        }
    }

    /**
     * The loudness around, as dB: the root mean square of three seconds against full scale, plus
     * 90 to land near everyday sound levels (the phone's microphone is not calibrated — the number
     * compares days with each other, it is not a sound meter). Nothing is kept but this number.
     */
    private Double noise() {
        if (!hasMicrophone(context)) {
            return null;
        }
        // The voice assistant has the microphone open all the time: its level is taken.
        Double heard = VoiceService.recentDb();
        if (heard != null) {
            return heard;
        }
        int size = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (size <= 0) {
            return null;
        }
        AudioRecord record = null;
        try {
            record = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size * 2);
            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                return null;
            }
            record.startRecording();
            short[] buffer = new short[size];
            long end = System.currentTimeMillis() + NOISE_MS;
            double sum = 0;
            long count = 0;
            while (System.currentTimeMillis() < end) {
                int read = record.read(buffer, 0, buffer.length);
                for (int i = 0; i < read; i++) {
                    sum += (double) buffer[i] * buffer[i];
                }
                count += Math.max(read, 0);
            }
            if (count == 0 || sum == 0) {
                return null;
            }
            double rms = Math.sqrt(sum / count) / 32768.0;
            return 20 * Math.log10(rms) + 90;
        } catch (RuntimeException e) {
            Log.w(TAG, "The noise was not heard", e);
            return null;
        } finally {
            if (record != null) {
                try {
                    record.stop();
                } catch (RuntimeException e) {
                    // Never started.
                }
                record.release();
            }
        }
    }
}
