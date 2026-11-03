package com.personalworld.dashboard.vpn;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The dashboard's VPN on the phone, through the AmneziaWG app (see `amnezia-vpn.ts` in
 * web-core): its tunnel switched on and off by the broadcasts AmneziaWG takes from an app it
 * trusts — the runtime permission CONTROL_TUNNELS, and "Allow remote control apps" switched on
 * in AmneziaWG itself. AmneziaWG tells nothing back: whether a VPN runs is Android's own answer.
 */
@CapacitorPlugin(name = "AmneziaVpn")
public class AmneziaVpnPlugin extends Plugin {

    static final String PACKAGE = "org.amnezia.awg";
    static final String CONTROL = PACKAGE + ".permission.CONTROL_TUNNELS";
    /** The tunnel's name in AmneziaWG: the setup asks to name it so on the import. */
    static final String TUNNEL = "dashboard";
    private static final String PREFS = "amnezia_vpn";
    private static final int CONTROL_REQUEST = 7311;

    @PluginMethod
    public void status(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("installed", installed(context));
        result.put("control", ContextCompat.checkSelfPermission(context, CONTROL) == PackageManager.PERMISSION_GRANTED);
        result.put("vpnActive", vpnActive(context));
        result.put("unrestricted", unrestricted(context));
        call.resolve(result);
    }

    /** Android asks the user once; the answer is seen in the next `status`. */
    @PluginMethod
    public void requestControl(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null && installed(getContext())) {
            ActivityCompat.requestPermissions(activity, new String[] {CONTROL}, CONTROL_REQUEST);
        }
        call.resolve();
    }

    /** `{ up: boolean, tunnel: string }` — the tunnel's name in AmneziaWG. */
    @PluginMethod
    public void setTunnel(PluginCall call) {
        boolean up = Boolean.TRUE.equals(call.getBoolean("up", true));
        switchTunnel(getContext(), call.getString("tunnel", TUNNEL), up);
        call.resolve();
    }

    /** `{ id }` — which VPN device this phone is, for the silent push that names one. */
    @PluginMethod
    public void setDevice(PluginCall call) {
        getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("device", call.getString("id", ""))
            .apply();
        call.resolve();
    }

    /**
     * "Turn the VPN on on the phone" from the assistant or another page, as a silent push
     * (PushMessagingService): acted on only when it names this phone's device.
     */
    public static void fromPush(Context context, String device, boolean up) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String mine = prefs.getString("device", "");
        if (device != null && !device.isEmpty() && device.equals(mine)) {
            switchTunnel(context, TUNNEL, up);
        }
    }

    private static void switchTunnel(Context context, String tunnel, boolean up) {
        Intent intent = new Intent(PACKAGE + (up ? ".action.SET_TUNNEL_UP" : ".action.SET_TUNNEL_DOWN"));
        intent.setPackage(PACKAGE);
        intent.putExtra("tunnel", tunnel);
        context.sendBroadcast(intent, null);
    }

    /** Android's VPN screen: "Always-on VPN" and "Block connections without VPN" are there. */
    @PluginMethod
    public void openVpnSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_VPN_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * AmneziaWG's page in Android's settings, for "Battery → No restrictions": a restricted app may
     * not start its VPN from the background, so the broadcast reaches it and nothing happens
     * ("Background start not allowed" in the log).
     */
    @PluginMethod
    public void openAmneziaSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + PACKAGE))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** AmneziaWG itself, for "Allow remote control apps" in its settings. */
    @PluginMethod
    public void openAmnezia(PluginCall call) {
        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(PACKAGE);
        if (intent != null) {
            getContext().startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    private static boolean installed(Context context) {
        try {
            context.getPackageManager().getPackageInfo(PACKAGE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** AmneziaWG is exempt from battery optimization: it may start its VPN from the background. */
    private static boolean unrestricted(Context context) {
        PowerManager power = context.getSystemService(PowerManager.class);
        return power != null && power.isIgnoringBatteryOptimizations(PACKAGE);
    }

    /** A VPN carries the phone's traffic now (any VPN: AmneziaWG is the one set up here). */
    private static boolean vpnActive(Context context) {
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        if (manager == null) {
            return false;
        }
        Network network = manager.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : manager.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
    }
}
