package com.personalworld.dashboard;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins, before Capacitor starts.
        registerPlugin(GentleWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
