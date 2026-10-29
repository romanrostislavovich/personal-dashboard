# Proposal: the mobile app

Status: stage 1a in progress. Android first; iOS later, if ever (it needs a Mac and a paid Apple
account).

## Decisions so far (2026-10-24)

- **The phone:** a Redmi 9 (MIUI): the setup screen must walk through autostart and battery
  saving, or MIUI kills the collection in the background. Health Connect needs Android 11+ for
  the Google Health app — check the phone's version.
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
- **The band:** Xiaomi Smart Band 9 Pro is out — Mi Fitness writes neither stress nor HRV to
  Health Connect (checked on the phone). Health Connect has **no stress type at all**, so stress
  is our own index from HRV and resting heart rate. Candidates: **Fitbit Charge 6** or **Fitbit
  Air** (screenless, 5 g, ~$99) — both reach us through the **Google Health API**, which replaces
  the Fitbit Web API (switched off on 2026-11-02): daily and interval HRV, sleep, heart rate,
  SpO2. Caveat to check when building it: a Google Cloud project in "testing" mode may need a new
  consent every 7 days. Fallback: **Polar Loop** with Polar's open AccessLink API.

## The idea

The phone is the sensor the dashboard lacks: sleep, stress, steps, where the day went, which apps
and notifications eat the attention. The app shows the same Angular web app as the browser and
the desktop shell, and adds only what a web page cannot do — like the desktop app does with
Electron.

- **Capacitor** wraps the web app; `apps/mobile` holds the shell and its native plugins.
- **The interface is packed into the APK**, not loaded from the server like in the desktop app:
  Capacitor's bridge to the native part works only for addresses known when the APK is built,
  and the server's address is typed at the first start. The page lives at `https://localhost`
  and calls the API at the server's address (`client-core`'s `baseUrl`; the server allows that
  origin in CORS, tokens in a header, the refresh token kept by the app). A bonus: it starts and
  reads without a network.
- **A deploy still reaches the phone at once:** the server hands out its build of the interface
  (`/mobile-updates`: `web.zip` + `bundle.json`, made by the Docker build); the app unpacks it and
  switches to it when it goes to the background (`WebView.setServerBasePath`). A new APK starts
  from its own interface again, which also mends a broken one.
- **The APK** is built in Docker by `deploy/deploy.sh` only when the native part changes
  (`deploy/mobile-apk.Dockerfile`, like the desktop installers), signed with
  `deploy/mobile-release.keystore` (never committed; its password in `deploy.local.env`), and put
  into `downloads/mobile` on the server: Settings → Apps offers it.
- The phone is a device of its own (like a computer of the desktop tracker), with its own token.
- Rejected: a native interface (React Native / Expo on `@pd/client-core`) — every section drawn
  twice, months of work for a look slightly more "native".

## Stage 1 — the base

- **1a (built, 2026-10-24):** the shell for Android — the connect page (which server), sign-in,
  the phone in Settings → Apps, the system Back button, the interface updating itself from the
  server, the APK built and offered by the server, the icons. Moved to stage 2: the MIUI setup
  screen (nothing runs in the background before stage 2).
- **1b, offline (built, 2026-10-24):**
  - every answer of the API is kept on the phone (`ReadCache` in client-core, IndexedDB in the
    app, `offline-read.interceptor.ts` for `httpResource`) — what the browser's service worker
    does for the web app; no answer or a slow one (8 s, a train) shows the kept one;
  - read ahead while there is a connection (`offline-prefetch.ts`): the diary of the last 12
    months and the last 31 days, tasks and reminders, habits, the gentle day;
  - writes wait in the outbox of `client-core` as before; the gentle day joined them;
  - **a diary entry changed on two devices loses nothing:** the editor sends the version it
    wrote over (`basedOn`); when the day changed since, the server keeps its text and adds the
    other below a line, and the phone's editor reads the day again after the sync;
  - the fonts and icons are served by the dashboard itself (`apps/web/fonts.mjs`), not Google:
    without a network the icons would show as words;
  - the app starts without a network, signed in as before, and the bar says it is offline.
  - **The diary's photos offline (built 2026-10-27):** a photo by its id never changes, so the
    app keeps the file (IndexedDB `files`, the newest 300) and shows the kept one without asking
    the server; the photos of the last 31 days are read ahead (`offline-prefetch.ts`).
- **1c, push notifications (built, 2026-10-24):** through Google (FCM HTTP v1), a channel
  next to Telegram (`notifications/push` in api-core): the owner pastes the Firebase service
  account's JSON in Settings → Notifications → Push on the phone (kept as a server key); the app
  asks Android for the permission, takes its token and tells the server; a phone whose token is
  gone is forgotten; a sync client sends none. The APK is built with
  `deploy/google-services.json` (not in git) when it is there. Switched off per phone in the same
  card; per section and channel in Settings → Notifications → "What comes where" (`muted` of
  the gentle mode, built 2026-10-25).
- **1d, gentle (built, 2026-10-24)** — the owner's choices: quiet hours 21:00–09:00, nothing
  comes in them; soft overdue always; the close person through Telegram.
  - **A gentle mode** (Settings → Notifications, `calm` of the account, every device): in the quiet
    hours Telegram and push wait (`held` in the outbox) and come at their end as **one** message,
    "while it was quiet: N"; a toast in an open tab still shows, a test the user sends comes at
    once. **Soft overdue:** no red in the task list and the home widget, nothing overdue in the
    morning digest.
  - **Help** (Psychology → Help, a link on the gentle day and its widget, the palette): a close
    person's Telegram in one tap (stored encrypted), the crisis lines of the user's country
    first (`crisis-lines.ts` in contracts: every country with its sources and the date checked;
    any other through Find A Helpline), the emergency number. Works offline: the numbers are in
    the app.
  - **The home-screen widget** (`GentleWidget` in apps/mobile, Java): the page hands it the
    day's text (`showOnGentleWidget`), a tap opens the app on the gentle day
    (`personaldashboard://psychology/gentle`); a day that has passed asks to open the app.
- MIUI and similar systems kill apps in the background: a setup screen walks through autostart
  and battery settings.

- **"Share" into the dashboard (built 2026-10-27):** a link, a text or a picture shared from any
  app (Android's share sheet) opens the capture page of the desktop app's shortcuts
  (`ShareTargetPlugin` in apps/mobile, `share-target.ts` and `capture.page.ts` in web-core): every
  module offers its commands — a task, a reminder in an hour, a note or a photo for today's diary,
  a film to watch (Movies → To watch searches TMDB by the text, links left out).

- **The bell and the shade (built 2026-10-27):** a tap on a push opens the notification's card
  (`/notifications/:id`), and after an answer the next question waiting. The app draws the
  bell's notifications itself (`inbox/PushMessagingService` replaces the push plugin's service;
  data messages to a phone registered as `rich`): a question of up to three buttons is answered in
  the shade without opening the app (`PushActionReceiver`, with a key that fits that notification
  alone), and its notification goes once it is answered elsewhere.

## Stage 2 — the phone as a sensor

**2a and 2b built (2026-10-24):** Settings → Apps inside the app → "The phone as a sensor":
switching it on registers the phone as a device of Activity (platform `android`) and hands its
token to the native collection (`sensors/` in apps/mobile, Java): `SensorsWorker` (WorkManager,
every 15 minutes) reads Android's usage events (`UsageSpans`, tested with JUnit on every APK
build) and posts them as spans to `/api/activity/device/spans`, and the notifications
`PhoneNotificationListener` wrote down to `/api/activity/device/notifications`
(`activity_phone_notifications`, title and text encrypted; Activity → Notifications). The card
leads through Usage access, Notification access, no battery limits and MIUI's autostart. Common
Android apps have categories (Instagram → media, Telegram → communication…).

**Unlocks and the night (built, 2026-10-25):** the worker sends each unlock (Android's
`KEYGUARD_HIDDEN` usage event) to `/api/activity/device/unlocks` (`activity_phone_unlocks`);
the night is the time in the phone's apps from 23:00 to 04:00, counted to the evening it began
on, like late games. Activity → Phone (it was Notifications) shows both above the
notifications; Links gets "phone unlocks" and "on the phone late at night" for the days the
phone told something.

**2c, the location (built, 2026-10-25):** the card's step "Location, all the time" asks Android
(10 offers "Allow all the time" in its own question; 11+ and a second tap — the app's settings).
Every minute, the owner's choice: `PlacesService`, a foreground service with a quiet
notification "recording the places" (Android gives an app in the background the location only a
few times an hour), started when the app comes up and by the worker; as a fallback Android
delivers a fix about every 15 minutes to `LocationUpdatesReceiver`
(`requestLocationUpdates` to a PendingIntent): on MIUI a fix asked for from a background job is
never answered — checked on the phone on 2026-10-25. Each run of `SensorsWorker` also takes one
fix (`PhoneLocation`): one another app asked for in the last
5 minutes as it is, else Wi-Fi and cell towers (no GPS; GPS for 20 s only when that is off) — the
battery barely notices. Fixes wait in `SensorsStore` without a network and go to
`/api/activity/device/locations` (`activity_phone_locations`, the point encrypted). The server
tells a day as stays (two fixes in a row within 200 m) and trips between them (`places/stays.ts`),
gathers the stays of 30 days into places, and the user names them ("Home") —
`activity_places`, the stays within 150 m take the name. Activity → Places shows a day; a link
opens a point on OpenStreetMap (no map is loaded by itself: tiles would tell the area). Links
gets "km on the move" and "places visited" for the days with enough fixes; the life timeline a
line. Not yet: a map on the page, names of places from an address lookup (it would send the
points out).

To Activity (a "phone" device) and Life, and from there to Links:

- time per app (Instagram, LinkedIn, …), unlocks, use of the phone at night;
- notifications: which app, when, how many, and their titles and text (encrypted like the
  diary) — to see what interrupts and how it goes with focus and mood;
- places and trips from the location, with care for the battery.

**Settings (2026-10-25), the owner's choices:** the settings are the same on every device;
a card of one kind of device shows everywhere with a mark of its colour (`pd-device-only`:
phone — tertiary, computer — primary) and says where it is set. Settings → Devices holds the
phone as a sensor (elsewhere: which phones collect, when each last sent), the trackers (a module
registers `devices` cards) and the copies on a computer; Settings → Apps stays for installing.
Settings → Notifications holds Telegram, push, the gentle mode and the delivery log; the language
stays in Account → Profile. Settings → Integrations lists every service the dashboard can
connect, the ones not connected greyed (`off`).

**More of the phone (built 2026-10-27, the owner's choices; collectors 11–15 of
docs/telemetry.md):** the next alarm (the wake planned, to Links next to the real first use), the
mobile network's country (trips without the GPS), the battery's temperature and health once an
hour, wired headphones (counted with the Bluetooth ones), and what was done with a notification —
opened or swiped away, and how fast. "Picked up" is not collected: Android tells no pick-up on most
phones; the unlocks say it.

## Stage 2d — a timeline of places (built 2026-10-25, the owner's choices)

Like Google Maps' timeline: a day as the places it was spent at, with names, and the routes
between them on a map.

- **Two modes of recording** (`PlacesService`): still — Wi-Fi and cell towers every minute; once a
  fix is ~150 m from where the phone stood, GPS every 5 seconds (like Strava, ~5–8% of the
  battery an hour of walking); back to still after 5 minutes within ~50 m.
- **Names of places:** a stay of 10 minutes or more is looked up once on OpenStreetMap
  (Nominatim reverse + nearby points of interest: the café, the gym, else the address) and kept;
  a place met again is not looked up again; the user's own name wins. A button "look up on
  Google" for a stay OpenStreetMap named wrong — needs a Google Places key (server key, kept on
  the server). Only the stays' points leave the server, never the routes.
- **The map** in Activity → Places: OpenStreetMap through Leaflet by default (no key; the tiles
  tell OSM which area is looked at); Google Maps as a switch once a browser key (restricted to
  the dashboard's addresses) is set. The day's route as a line, the stays as marks with their
  names and times, and every place of a period.
- **How one moved:** walking, cycling or riding, by the speed of a trip; time on foot and outdoors.
- **To Links and Life:** new places a week, hours at home, time on the way, places ↔ mood/sleep.
- **Automations by places:** came to / left a place (the gym → mark the habit; left work → a
  reminder).
- **Google Takeout import:** the old timeline of Google Maps (places and routes of past years).

All of it is built (2026-10-25): `MotionMode` + `PlacesService` (apps/mobile), `places/` in the
activity module (`stays.ts`, `frequent.ts`, `day-numbers.ts`, `place-names.service.ts` with
`place-lookup.clients.ts`, `places.automations.ts`), `google-timeline.ts` in contracts (the
Takeout parser, run in the browser), and Activity → Places with `places-map.component.ts`.
Home is the place of most nights (3 am) in the 60 days before. Checked on a throwaway server with
public points of central Warsaw; the GPS mode on a real walk, Google's keys and a real Takeout
file are not checked yet.

## Stage 3 — health and stress

**The band:** the owner chose the **Fitbit Air**; it arrives on 2026-10-27 (Tuesday).

- From Health Connect: steps, calories, heart rate, sleep and its stages, heart rate variability
  (HRV) — whatever the band writes there.
- **Stress:** Health Connect has no stress type, and the bands keep their own stress score inside
  their apps (Xiaomi's Mi Fitness, checked on the user's phone, does not write it). The plan:
  count our own stress index from HRV and resting heart rate, so any band that writes HRV will
  do; a band's own API (Polar, Fitbit) only if ours is not enough. The band to buy is the one that
  writes HRV to Health Connect — to be checked on its permission screen before buying.

**Built (2026-10-26), before the band arrived:** the band is read from the server through the Google Health API (Health → Band, Settings → Integrations → Google Health; `libs/modules/health/api/src/lib/wearable`), not through Health Connect on the phone: the Fitbit Air needs the Google Health app, which needs Android 11+, and the owner's phone is a Redmi 9 (`galahad`) on Android 10 with no update (the official Redmi 9 ROM refuses it). The band can be paired with any Android 11+ phone or an iPhone — the dashboard does not care which. Written from the documented API shapes; nothing ran against the real API yet. The stress index from HRV and resting heart rate is still to come.

## Stage 4 — voice

- A voice assistant called by its name, like a smart speaker: "Hey <name>, how long was I on
  the phone today?", "my favourite bands of the last two months?". The answer comes from the
  assistant that already has tools for every section; the wake word is recognised on the phone.
- Voice notes into the diary (speech to text already works for Telegram).
- Maybe: the noise level around as a number (no sound kept).

**Built (2026-10-26, the owner's choices):** the name is heard on the phone by **Vosk** (offline,
the small Russian model, ~45 MB, downloaded once into the app's files), with a grammar of that one
word; it listens **all the time** (a foreground service with a quiet notification); the default
name is **«Люцифер»**, changed in Settings → Devices → Voice assistant — the phone checks the word
is in the model's vocabulary (the symbol table of `graph/Gr.fst`) and warns if not. After the name:
a beep, the question recorded until a pause (with the 1.5 s before the name, for a question said
in one breath), sent as WAV to `POST /api/activity/device/voice` with the phone's device token,
recognised by the AI's speech connection, answered by the assistant (same conversation as the
web chat and Telegram, every section's tools, writes too — "…, put in the diary that…"), with a
prompt for a short spoken answer; the answer is read by Android's TextToSpeech and kept in a
notification. A question to confirm is listened for again at once. The noise level of the day
is taken from the open microphone while it listens. Code: `apps/mobile/.../voice/`,
`VoiceAssistantService` in api-core, `PhoneVoiceController` in activity. Not tried on the phone
yet at the time of writing.

## Later

- **A seizure alert for close people** (behind a feature flag): the app notices a likely seizure
  (the band's heart rate and the phone's or band's motion) or gets a button press, and tells the
  chosen close people where the person is. Needs a careful study first: false alarms, battery,
  and it must never be the only safety net.
