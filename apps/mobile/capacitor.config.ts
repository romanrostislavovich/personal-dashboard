import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app: the same Angular app as the browser, packed inside (`webDir`) so it starts and
 * works without a network. It talks to the server the user names at the first start; a newer
 * build of the interface comes from that server and replaces the packed one (MobileUpdateService
 * in web-core). See docs/proposals/mobile-app.md.
 */
const config: CapacitorConfig = {
  appId: 'com.personalworld.dashboard',
  appName: 'Personal Dashboard',
  webDir: '../../dist/apps/web/browser',
  // The page's origin is https://localhost: the server allows it in CORS (apps/api main.ts).
  server: { androidScheme: 'https', hostname: 'localhost' },
  // chrome://inspect sees the page of the release build too: a problem on the phone is looked
  // at, not guessed. Only a computer the phone allowed over USB debugging can connect.
  android: { webContentsDebuggingEnabled: true },
  plugins: {
    // A push that comes while the app is open shows in the shade too: without "alert" the
    // plugin only hands it to the page, and a test sent from Settings seems lost.
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
