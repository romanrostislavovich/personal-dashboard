# The Android app

The dashboard's web app inside an Android shell ([Capacitor](https://capacitorjs.com)), with the
interface packed into the APK so it starts without a network. Android only; iOS is not planned
(it needs a Mac and a paid Apple account). What is left is in docs/roadmap.md and the owner's
tasks tagged «отложено».

| File                  | What it is                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `capacitor.config.ts` | the app's id and name, where the built web app is taken from              |
| `android/`            | the Android project (Gradle); the copy of the web app in it is not in git |
| `pack-web.mjs`        | the interface the server hands out to installed apps (Docker build)       |
| `icons.mjs`           | the launcher icons and start screens, from `apps/web/public`              |

The code of the app is in web-core (`libs/web/core/src/lib/mobile`): the connect page, the API at
the server's address, the system Back button, Settings → Apps, the interface update, offline
reading (diary photos too), "Share" from other apps (`share-target.ts`, the native side is
`ShareTargetPlugin.java`). The phone's collectors are Java in `android/.../sensors`
(docs/telemetry.md lists each one).

## Decisions (2026-10-24, updated 2026-10-30)

- **The phone:** a REDMI 17 (HyperOS 3, Android 16) since 2026-10-29, in place of the Redmi 9
  (MIUI, Android 10, which could not run the Google Health app). The setup card walks through
  autostart and battery saving, or the system kills the collection in the background.
- **For whom:** the owner only for now, maybe everyone later. The APK is served by the server
  like the browser extension.
- **No fingerprint lock** for now.
- **Push** through Google (FCM); the owner makes the Firebase project when stage 1c comes.
- **Offline:** as much as possible — read the picked sections on a train, write, and the writes
  go out when the network is back.
- **Notifications of other apps:** all of them, with titles and text (encrypted), to see what
  interrupts. No draft transactions from bank notifications: Open Banking already covers it.
- **Location:** yes.
- **Gentle features:** yes — the widget, quiet hours, the help button with crisis lines of every
  country (a list with sources) and a close person's contact to call or write.
- **The microphone:** allowed; first use — a voice assistant called by name.
- **The band:** the **Fitbit Air** (worn since 2026-10-27). Xiaomi Smart Band 9 Pro was out —
  Mi Fitness writes neither stress nor HRV to Health Connect. Health Connect has **no stress type
  at all**, so stress is our own index from HRV and resting heart rate. What Health Connect lacks
  (resting pulse, SpO2, zone minutes) comes from the **Google Health API**, which replaces the
  Fitbit Web API (switched off on 2026-11-02); a Google Cloud project in "testing" mode may need
  a new consent every 7 days.

## Building

There is no Android SDK on the developer's computer: `deploy/deploy.sh` builds the APK in Docker
(`deploy/mobile-apk.Dockerfile`) when the native part changes and puts it on the server. By hand:

```bash
set -a; . deploy/deploy.local.env; set +a   # MOBILE_KEYSTORE_PASSWORD
docker buildx build -f deploy/mobile-apk.Dockerfile --build-arg BUILD_ID=dev \
  --build-arg VERSION_NAME=dev --build-arg VERSION_CODE=1 \
  --secret id=keystore,src=deploy/mobile-release.keystore \
  --secret id=keystore_password,env=MOBILE_KEYSTORE_PASSWORD \
  --output type=local,dest=dist/mobile-apk .
```

With Android Studio instead: `npx nx run mobile:sync`, then open `apps/mobile/android`.

**Keep `deploy/mobile-release.keystore` and its password.** Android installs an update only when
it is signed with the same key: with a new key the app has to be removed (and its data with it)
before the new one goes on.
