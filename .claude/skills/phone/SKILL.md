---
name: phone
description: Work with the owner's phone (REDMI 17, Android 16, HyperOS 3) over USB with adb — screenshots, installing the APK, opening app screens and Health Connect permissions, running the background collection, reading logs. Use for any on-device check of the mobile app.
---

# The phone over adb

`adb` is not on PATH: `"$LOCALAPPDATA/Android/platform-tools-dl/platform-tools/adb.exe"`
(Google's platform-tools). The phone is connected by cable with USB debugging on.
Changing the phone's settings or permissions is the owner's call — open the screen, let them tap.

- Devices / facts: `adb devices -l`; `adb shell getprop ro.build.version.release`.
- Screenshot (Git Bash needs MSYS_NO_PATHCONV for exec-out):
  `MSYS_NO_PATHCONV=1 adb exec-out screencap -p > <scratchpad>/x.png`, then Read it.
- Install the APK the deploy built, keeping data:
  `adb install -r dist/server-apk/personal-dashboard.apk` (Play Protect does not object over adb).
  Version: `adb shell dumpsys package com.personalworld.dashboard | grep versionName`.
- Open a page of the app: `adb shell am start -a android.intent.action.VIEW -d "personaldashboard://<route>" com.personalworld.dashboard`
  (e.g. `health/band`, `settings?tab=devices` — the phone card there starts a collection run).
- Health Connect permissions of the app:
  `adb shell am start -a android.health.connect.action.MANAGE_HEALTH_PERMISSIONS --es android.intent.extra.PACKAGE_NAME com.personalworld.dashboard`;
  granted ones: `adb shell dumpsys package com.personalworld.dashboard | grep "permission.health"`.
- The background collection (`SensorsWorker`, every 15 min): watch
  `adb logcat -d | grep -E "WM-WorkerWrapper|HealthConnectSync|SensorsWorker"` for
  "Worker result SUCCESS/FAILURE".
- Scroll / tap for a screenshot: `adb shell input swipe 360 1400 360 300 300`, `adb shell input tap X Y`.

Android 14+ refuses health permissions asked with the ordinary runtime request — they are asked on
Health Connect's own screen (`REQUEST_HEALTH_PERMISSIONS`, for a result).
