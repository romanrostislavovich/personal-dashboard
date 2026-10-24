# Proposal: the mobile app

Status: stage 1a in progress. Android first; iOS later, if ever (it needs a Mac and a paid Apple
account).

## Decisions so far (2026-10-24)

- **The phone:** a Redmi Note 9 (MIUI): the setup screen must walk through autostart and battery
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
- The interface comes from the user's server, so a deploy updates it; a new APK is needed only
  when the native part changes. The APK is built in CI and served by the server, like the browser
  extension, and the app updates itself from there.
- The phone is a device of its own (like a computer of the desktop tracker), with its own token.
- Rejected: a native interface (React Native / Expo on `@pd/client-core`) — every section drawn
  twice, months of work for a look slightly more "native".

## Stage 1 — the base

- The shell for Android: sign-in, the phone in the list of devices, the self-update of the APK.
- **Offline, as far as it goes:** the sections the user picks are kept on the phone to read
  without a network (the diary, tasks, the gentle day, health…); writes made offline wait in the
  outbox of `client-core` and go out when the network is back. A record changed both on the phone
  and on a computer needs a rule (the later one wins, the other kept as a copy).
- **Push notifications** through Google (FCM), next to Telegram, switched off per kind.
- **Gentle on the phone:** a home-screen widget of the gentle day; quiet hours in the evening and
  at night (nothing about overdue tasks); a help button — the crisis lines of the user's country
  (a list kept in the repository with the source of every number) and "call or write a close
  person" (a contact the user adds by hand).
- MIUI and similar systems kill apps in the background: a setup screen walks through autostart
  and battery settings.

## Stage 2 — the phone as a sensor

To Activity (a "phone" device) and Life, and from there to Links:

- time per app (Instagram, LinkedIn, …), unlocks, use of the phone at night;
- notifications: which app, when, how many, and their titles and text (encrypted like the
  diary) — to see what interrupts and how it goes with focus and mood;
- places and trips from the location, with care for the battery.

## Stage 3 — health and stress

- From Health Connect: steps, calories, heart rate, sleep and its stages, heart rate variability
  (HRV) — whatever the band writes there.
- **Stress:** Health Connect has no stress type, and the bands keep their own stress score inside
  their apps (Xiaomi's Mi Fitness, checked on the user's phone, does not write it). The plan:
  count our own stress index from HRV and resting heart rate, so any band that writes HRV will
  do; a band's own API (Polar, Fitbit) only if ours is not enough. The band to buy is the one that
  writes HRV to Health Connect — to be checked on its permission screen before buying.

## Stage 4 — voice

- A voice assistant called by its name, like a smart speaker: "Hey <name>, how long was I on
  the phone today?", "my favourite bands of the last two months?". The answer comes from the
  assistant that already has tools for every section; the wake word is recognised on the phone.
- Voice notes into the diary (speech to text already works for Telegram).
- Maybe: the noise level around as a number (no sound kept).

## Later

- **A seizure alert for close people** (behind a feature flag): the app notices a likely seizure
  (the band's heart rate and the phone's or band's motion) or gets a button press, and tells the
  chosen close people where the person is. Needs a careful study first: false alarms, battery,
  and it must never be the only safety net.
