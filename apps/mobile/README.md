# The Android app

The dashboard's web app inside an Android shell ([Capacitor](https://capacitorjs.com)). The plan,
the decisions and why the interface is packed into the APK: `docs/proposals/mobile-app.md`.

| File                  | What it is                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `capacitor.config.ts` | the app's id and name, where the built web app is taken from              |
| `android/`            | the Android project (Gradle); the copy of the web app in it is not in git |
| `pack-web.mjs`        | the interface the server hands out to installed apps (Docker build)       |
| `icons.mjs`           | the launcher icons and start screens, from `apps/web/public`              |

The code of the app is in web-core (`libs/web/core/src/lib/mobile`): the connect page, the API at
the server's address, the system Back button, Settings → Apps, the interface update.

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
