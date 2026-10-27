package com.personalworld.dashboard;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.personalworld.dashboard.sensors.PhoneSensorsPlugin;
import com.personalworld.dashboard.sensors.PlacesService;
import com.personalworld.dashboard.voice.VoiceService;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins, before Capacitor starts.
        registerPlugin(GentleWidgetPlugin.class);
        registerPlugin(PhoneSensorsPlugin.class);
        registerPlugin(ShareTargetPlugin.class);
        super.onCreate(savedInstanceState);
        ShareTargetPlugin.receive(this, getIntent());
    }

    /** A share while the app runs (singleTask: the same activity gets it). */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        ShareTargetPlugin.receive(this, intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Android 12 and later start the places service only from the screen: each time the
        // app comes up it is made sure to run (and after the location was just allowed).
        PlacesService.start(this);
        VoiceService.start(this);
    }
}
