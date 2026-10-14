# Changelog

Notable changes of every release. The versions follow [Semantic Versioning](https://semver.org/);
before 1.0 a minor version may bring changes that need attention when updating — they are listed
under **Updating**.

## Unreleased

### Added

- **Health** — one medical history of your own across countries and clinics: visits with
  their complaints, examination and recommendations, diagnoses by ICD code gathered into
  conditions with their history, medications (by the active substance too) and the documents
  — scans, photos, PDFs. Stored encrypted. The ICD-10 dictionary is downloaded from WHO by your
  own server after you accept WHO's terms (Settings → Integrations); it is never shipped or
  exported. A dictionary in Russian, Ukrainian or any language is loaded from a CSV or XLSX
  file of your own.
- **Health: lab results and studies** — a lab report as the laboratory gave it (its units and
  its own reference ranges); about 60 common analytes recognised by their names in Ukrainian,
  Russian, Polish or English, so one analyte from labs in different countries is one chart in
  one unit, with the laboratory's range as a band and what was out of it marked. Studies
  (ultrasound, MRI, ECG…) with their conclusions.
- **Health: a document read by the AI** — a photo or a PDF of a consultation, lab results or a
  study becomes a draft in its own language: the visit with its clinic, doctor, diagnoses and
  medications, the lab report line by line, or the study. Nothing is saved until you check the
  draft beside the original and press Save. From Telegram too: a photo with “🩺 A medical
  document”. The AI is Health's own connection when it has one. A document photographed page
  by page is one document: several photos at once, pages added later, or an album in Telegram —
  the AI reads every page together.
- **Health: a summary for a new doctor** — current diagnoses, medications, the latest results
  with their trend, studies and visits, under headings in Polish, Ukrainian, Russian, English
  or German, the texts translated by the AI if you ask; a speciality can be left out with
  everything of it. Opened to print or save as PDF, downloaded for Word, or shared as a link
  the doctor opens without an account for 1–30 days — revocable, with how often it was
  opened.
- **Health and the other sections** — Psychology shows the mood during the treatment of the
  mind (medications of a psychiatrist or psychotherapist, F-diagnoses); a line of a doctor's
  recommendations becomes a task in one click; the next visits in the morning digest (when
  ticked); Health in the command palette; demo data.
- **Health: the profile and medication reminders** — blood type, allergies, vaccinations with
  the next dose and operations, first in the summary for a doctor; a reminder to take a
  medication at its times, with “Taken” and “Skip” in Telegram and on the page, and how the
  taking went over two weeks; vaccinations due in the digest.
- **An AI connection of its own for a section** (Settings → AI): a local model for Health, say;
  the section's data then never reaches the shared connection.
- **Columns stored encrypted** for modules (`encryptedText()`, `encryptedBytes()`): a dump or a
  backup holds only ciphertext; the export of one's data writes them decrypted.
- **Psychology** — a section for watching oneself over time: the patterns of the mood, short
  questionnaires with their history (WHO-5, GAD-7, PHQ-9; self-observation, not a diagnosis)
  and the events of a life — told by their dates or by the age they happened at — saved as an
  Excel workbook or a Word document.
- **Evening check-in in Telegram**: the diary's evening reminder now has mood buttons, and the
  next message goes to the entry of that day.
- **State of the connections** in Settings → Integrations: every connected service with its
  last refresh, the error of a failed one, a token that expires soon (GitHub, GitLab); a
  message once a day when a connection gets into trouble. The assistant can read it too.
- **Demo mode** (`DEMO_MODE=true`): a "Try the demo" button on the login page opens a shared
  account with made-up data in every section, made anew every night. The demo user cannot
  change the account, connect services or upload files, and no background job reaches outside.
- **Copies on this computer** — the desktop app saves the archive of "Export everything" once a
  day into a folder of the computer (Settings → Data), the last 14 kept: the data outlives the
  server and comes back through "Import archive".

### Fixed

- **Background jobs send nothing twice.** A failed run was retried at once, twice, and a run
  over 15 minutes was taken as hung and started again — reminders and payments repeated. Jobs
  are no longer retried (a sync that sends nothing may be, with a backoff), may run an hour (the
  wishlist three), and a job over the users goes on past one user's error and reports it after.
- **Calls to outside services give up after 30 seconds** (GitHub, GitLab, Bitbucket, WakaTime,
  Steam, Battle.net, OpenDota, Last.fm, Spotify, Hetzner, DeepSeek, npm, files from Telegram).
- **`/api/health` checks the database and the background jobs**, and answers 503 when either is
  down, so Docker sees a broken container.
- **The trash keeps only what a person deleted**: the daily cleanup of old activity measurements
  no longer fills it.
- **The Docker image is published only after CI passes** on the commit.

### Updating

- Migration 0062 adds `integration_alerts`, 0063–0065 the tables of Psychology, 0066
  `ai_settings.module_connections`, 0067 the tables of Health, 0068 its lab results and studies, 0069 the
  drafts of its documents, 0070 the links for doctors, 0071 the profile
  and the reminders to take medications, 0072 the pages of its documents, 0073 the missing
  indexes (`user_id` and foreign keys of a few dozen tables).
- Encrypted columns use `ENCRYPTION_KEY`: a local copy that syncs with the server needs the same
  key as the server.

## 0.3.0 — the first public release

### Added

- **Links between the sections.** What one section knows is shown where another needs it, with
  the modules still independent (the core joins them):
  - a project across the sections — time at the computer, coding time, money, tasks, uptime,
    commits and releases, money per hour of work, month by month;
  - time of a computer without the tracker (WakaTime) and of games on other devices (Steam) in
    the time at the computer, without counting anything twice;
  - what goes with a good and a bad day: the numbers of every section, the weather and the
    daily rhythm against the mood of the diary;
  - the last commit before a site went down, and whether your own computers lost the server at
    the same time;
  - subscriptions against their use; a wish against its savings goal and the month's budget;
    gift ideas of the wishlist in Birthdays, and a task to buy a gift a week before;
  - the music of focus sessions; the time of a task from focus sessions and window titles;
    a limit of games that grows with the tasks done.
- **Security agent** — watches sign-ins, the server, your computers and repositories every
  hour; an AI investigates in the morning and writes a guide for each finding.
- **Export and import** of everything you keep, as a ZIP with readable files.
- **Wishlist** with prices read from the shops' pages every day.
- **Days of memory** next to birthdays.
- **Repositories** of GitHub, GitLab and Bitbucket in one tab, private ones too.
- The assistant: a tool for every link, links to the pages of the app in its answers, search in
  your own history.
- More than 360 achievements, some for what the sections know together.

### Security

- The server refuses to start with the placeholder secrets of `.env.example`.
- Requests to addresses users give (a monitored site, a shop's page, an AI endpoint) do not go
  to private and local addresses once registration is open (`ALLOW_PRIVATE_URLS`).
- PostgreSQL of the local `docker-compose.yml` listens on this computer only.
- The assistant asks before it replaces text in the diary, as it does before deleting.

### Updating

- With `ALLOW_REGISTRATION=true`, monitors and AI connections that point to a private address
  (a NAS at `192.168.*`, Ollama on `localhost`) stop working until `ALLOW_PRIVATE_URLS=true` is
  set. A personal instance (registration closed) is not affected.
- A database of the local `docker-compose.yml` reached from another computer of your network
  needs its port published again by hand.

## 0.2.1 and earlier

Before the repository was public; see the
[releases](https://github.com/romanrostislavovich/personal-dashboard/releases).
